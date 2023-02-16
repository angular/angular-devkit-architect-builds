"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBuilder = void 0;
const core_1 = require("@angular-devkit/core");
const rxjs_1 = require("rxjs");
const api_1 = require("./api");
const internal_1 = require("./internal");
const jobs_1 = require("./jobs");
const schedule_by_name_1 = require("./schedule-by-name");
// eslint-disable-next-line max-lines-per-function
function createBuilder(fn) {
    const cjh = jobs_1.createJobHandler;
    // eslint-disable-next-line max-lines-per-function
    const handler = cjh((options, context) => {
        const scheduler = context.scheduler;
        const progressChannel = context.createChannel('progress');
        const logChannel = context.createChannel('log');
        let currentState = api_1.BuilderProgressState.Stopped;
        const teardownLogics = [];
        let tearingDown = false;
        let current = 0;
        let status = '';
        let total = 1;
        function log(entry) {
            logChannel.next(entry);
        }
        function progress(progress, context) {
            currentState = progress.state;
            if (progress.state === api_1.BuilderProgressState.Running) {
                current = progress.current;
                total = progress.total !== undefined ? progress.total : total;
                if (progress.status === undefined) {
                    progress.status = status;
                }
                else {
                    status = progress.status;
                }
            }
            progressChannel.next({
                ...progress,
                ...(context.target && { target: context.target }),
                ...(context.builder && { builder: context.builder }),
                id: context.id,
            });
        }
        return new rxjs_1.Observable((observer) => {
            const subscriptions = [];
            const inputSubscription = context.inboundBus.subscribe((i) => {
                switch (i.kind) {
                    case jobs_1.JobInboundMessageKind.Stop:
                        // Run teardown logic then complete.
                        tearingDown = true;
                        Promise.all(teardownLogics.map((fn) => fn() || Promise.resolve())).then(() => observer.complete(), (err) => observer.error(err));
                        break;
                    case jobs_1.JobInboundMessageKind.Input:
                        if (!tearingDown) {
                            onInput(i.value);
                        }
                        break;
                }
            });
            function onInput(i) {
                const builder = i.info;
                const loggerName = i.target
                    ? (0, api_1.targetStringFromTarget)(i.target)
                    : builder.builderName;
                const logger = new core_1.logging.Logger(loggerName);
                subscriptions.push(logger.subscribe((entry) => log(entry)));
                const context = {
                    builder,
                    workspaceRoot: i.workspaceRoot,
                    currentDirectory: i.currentDirectory,
                    target: i.target,
                    logger: logger,
                    id: i.id,
                    async scheduleTarget(target, overrides = {}, scheduleOptions = {}) {
                        const run = await (0, schedule_by_name_1.scheduleByTarget)(target, overrides, {
                            scheduler,
                            logger: scheduleOptions.logger || logger.createChild(''),
                            workspaceRoot: i.workspaceRoot,
                            currentDirectory: i.currentDirectory,
                        });
                        // We don't want to subscribe errors and complete.
                        subscriptions.push(run.progress.subscribe((event) => progressChannel.next(event)));
                        return run;
                    },
                    async scheduleBuilder(builderName, options = {}, scheduleOptions = {}) {
                        const run = await (0, schedule_by_name_1.scheduleByName)(builderName, options, {
                            scheduler,
                            target: scheduleOptions.target,
                            logger: scheduleOptions.logger || logger.createChild(''),
                            workspaceRoot: i.workspaceRoot,
                            currentDirectory: i.currentDirectory,
                        });
                        // We don't want to subscribe errors and complete.
                        subscriptions.push(run.progress.subscribe((event) => progressChannel.next(event)));
                        return run;
                    },
                    async getTargetOptions(target) {
                        return (0, rxjs_1.firstValueFrom)(scheduler.schedule('..getTargetOptions', target).output);
                    },
                    async getProjectMetadata(target) {
                        return (0, rxjs_1.firstValueFrom)(scheduler.schedule('..getProjectMetadata', target).output);
                    },
                    async getBuilderNameForTarget(target) {
                        return (0, rxjs_1.firstValueFrom)(scheduler.schedule('..getBuilderNameForTarget', target).output);
                    },
                    async validateOptions(options, builderName) {
                        return (0, rxjs_1.firstValueFrom)(scheduler.schedule('..validateOptions', [builderName, options]).output);
                    },
                    reportRunning() {
                        switch (currentState) {
                            case api_1.BuilderProgressState.Waiting:
                            case api_1.BuilderProgressState.Stopped:
                                progress({ state: api_1.BuilderProgressState.Running, current: 0, total }, context);
                                break;
                        }
                    },
                    reportStatus(status) {
                        switch (currentState) {
                            case api_1.BuilderProgressState.Running:
                                progress({ state: currentState, status, current, total }, context);
                                break;
                            case api_1.BuilderProgressState.Waiting:
                                progress({ state: currentState, status }, context);
                                break;
                        }
                    },
                    reportProgress(current, total, status) {
                        switch (currentState) {
                            case api_1.BuilderProgressState.Running:
                                progress({ state: currentState, current, total, status }, context);
                        }
                    },
                    addTeardown(teardown) {
                        teardownLogics.push(teardown);
                    },
                };
                context.reportRunning();
                let result;
                try {
                    result = fn(i.options, context);
                    if ((0, api_1.isBuilderOutput)(result)) {
                        result = (0, rxjs_1.of)(result);
                    }
                    else if (!(0, rxjs_1.isObservable)(result) && isAsyncIterable(result)) {
                        result = (0, api_1.fromAsyncIterable)(result);
                    }
                    else {
                        result = (0, rxjs_1.from)(result);
                    }
                }
                catch (e) {
                    result = (0, rxjs_1.throwError)(e);
                }
                // Manage some state automatically.
                progress({ state: api_1.BuilderProgressState.Running, current: 0, total: 1 }, context);
                subscriptions.push(result
                    .pipe((0, rxjs_1.defaultIfEmpty)({ success: false }), (0, rxjs_1.tap)(() => {
                    progress({ state: api_1.BuilderProgressState.Running, current: total }, context);
                    progress({ state: api_1.BuilderProgressState.Stopped }, context);
                }), (0, rxjs_1.mergeMap)(async (value) => {
                    // Allow the log queue to flush
                    await new Promise(setImmediate);
                    return value;
                }))
                    .subscribe((message) => observer.next(message), (error) => observer.error(error), () => observer.complete()));
            }
            return () => {
                subscriptions.forEach((x) => x.unsubscribe());
                inputSubscription.unsubscribe();
            };
        });
    });
    return {
        handler,
        [internal_1.BuilderSymbol]: true,
        [internal_1.BuilderVersionSymbol]: require('../package.json').version,
    };
}
exports.createBuilder = createBuilder;
function isAsyncIterable(obj) {
    return !!obj && typeof obj[Symbol.asyncIterator] === 'function';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9hcmNoaXRlY3Qvc3JjL2NyZWF0ZS1idWlsZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7OztBQUVILCtDQUFxRDtBQUNyRCwrQkFXYztBQUNkLCtCQWFlO0FBQ2YseUNBQTBFO0FBQzFFLGlDQUFpRTtBQUNqRSx5REFBc0U7QUFFdEUsa0RBQWtEO0FBQ2xELFNBQWdCLGFBQWEsQ0FDM0IsRUFBMEI7SUFFMUIsTUFBTSxHQUFHLEdBQUcsdUJBQWdCLENBQUM7SUFDN0Isa0RBQWtEO0lBQ2xELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBc0MsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEVBQUU7UUFDNUUsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUNwQyxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzFELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDaEQsSUFBSSxZQUFZLEdBQXlCLDBCQUFvQixDQUFDLE9BQU8sQ0FBQztRQUN0RSxNQUFNLGNBQWMsR0FBMEMsRUFBRSxDQUFDO1FBQ2pFLElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQztRQUN4QixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDaEIsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUVkLFNBQVMsR0FBRyxDQUFDLEtBQXVCO1lBQ2xDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekIsQ0FBQztRQUNELFNBQVMsUUFBUSxDQUFDLFFBQThCLEVBQUUsT0FBdUI7WUFDdkUsWUFBWSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7WUFDOUIsSUFBSSxRQUFRLENBQUMsS0FBSyxLQUFLLDBCQUFvQixDQUFDLE9BQU8sRUFBRTtnQkFDbkQsT0FBTyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQzNCLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO2dCQUU5RCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssU0FBUyxFQUFFO29CQUNqQyxRQUFRLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztpQkFDMUI7cUJBQU07b0JBQ0wsTUFBTSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7aUJBQzFCO2FBQ0Y7WUFFRCxlQUFlLENBQUMsSUFBSSxDQUFDO2dCQUNuQixHQUFJLFFBQTRCO2dCQUNoQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2pELEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDcEQsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFO2FBQ2YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELE9BQU8sSUFBSSxpQkFBVSxDQUFPLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDdkMsTUFBTSxhQUFhLEdBQW1CLEVBQUUsQ0FBQztZQUV6QyxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7Z0JBQzNELFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRTtvQkFDZCxLQUFLLDRCQUFxQixDQUFDLElBQUk7d0JBQzdCLG9DQUFvQzt3QkFDcEMsV0FBVyxHQUFHLElBQUksQ0FBQzt3QkFDbkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FDckUsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUN6QixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FDN0IsQ0FBQzt3QkFDRixNQUFNO29CQUNSLEtBQUssNEJBQXFCLENBQUMsS0FBSzt3QkFDOUIsSUFBSSxDQUFDLFdBQVcsRUFBRTs0QkFDaEIsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQzt5QkFDbEI7d0JBQ0QsTUFBTTtpQkFDVDtZQUNILENBQUMsQ0FBQyxDQUFDO1lBRUgsU0FBUyxPQUFPLENBQUMsQ0FBZTtnQkFDOUIsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLElBQW1CLENBQUM7Z0JBQ3RDLE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBQyxNQUFNO29CQUN6QixDQUFDLENBQUMsSUFBQSw0QkFBc0IsRUFBQyxDQUFDLENBQUMsTUFBZ0IsQ0FBQztvQkFDNUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7Z0JBQ3hCLE1BQU0sTUFBTSxHQUFHLElBQUksY0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFFOUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUU1RCxNQUFNLE9BQU8sR0FBbUI7b0JBQzlCLE9BQU87b0JBQ1AsYUFBYSxFQUFFLENBQUMsQ0FBQyxhQUFhO29CQUM5QixnQkFBZ0IsRUFBRSxDQUFDLENBQUMsZ0JBQWdCO29CQUNwQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQWdCO29CQUMxQixNQUFNLEVBQUUsTUFBTTtvQkFDZCxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUU7b0JBQ1IsS0FBSyxDQUFDLGNBQWMsQ0FDbEIsTUFBYyxFQUNkLFlBQTZCLEVBQUUsRUFDL0Isa0JBQW1DLEVBQUU7d0JBRXJDLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBQSxtQ0FBZ0IsRUFBQyxNQUFNLEVBQUUsU0FBUyxFQUFFOzRCQUNwRCxTQUFTOzRCQUNULE1BQU0sRUFBRSxlQUFlLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDOzRCQUN4RCxhQUFhLEVBQUUsQ0FBQyxDQUFDLGFBQWE7NEJBQzlCLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxnQkFBZ0I7eUJBQ3JDLENBQUMsQ0FBQzt3QkFFSCxrREFBa0Q7d0JBQ2xELGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUVuRixPQUFPLEdBQUcsQ0FBQztvQkFDYixDQUFDO29CQUNELEtBQUssQ0FBQyxlQUFlLENBQ25CLFdBQW1CLEVBQ25CLFVBQTJCLEVBQUUsRUFDN0Isa0JBQW1DLEVBQUU7d0JBRXJDLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBQSxpQ0FBYyxFQUFDLFdBQVcsRUFBRSxPQUFPLEVBQUU7NEJBQ3JELFNBQVM7NEJBQ1QsTUFBTSxFQUFFLGVBQWUsQ0FBQyxNQUFNOzRCQUM5QixNQUFNLEVBQUUsZUFBZSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQzs0QkFDeEQsYUFBYSxFQUFFLENBQUMsQ0FBQyxhQUFhOzRCQUM5QixnQkFBZ0IsRUFBRSxDQUFDLENBQUMsZ0JBQWdCO3lCQUNyQyxDQUFDLENBQUM7d0JBRUgsa0RBQWtEO3dCQUNsRCxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFFbkYsT0FBTyxHQUFHLENBQUM7b0JBQ2IsQ0FBQztvQkFDRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsTUFBYzt3QkFDbkMsT0FBTyxJQUFBLHFCQUFjLEVBQ25CLFNBQVMsQ0FBQyxRQUFRLENBQ2hCLG9CQUFvQixFQUNwQixNQUFNLENBQ1AsQ0FBQyxNQUFNLENBQ1QsQ0FBQztvQkFDSixDQUFDO29CQUNELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxNQUF1Qjt3QkFDOUMsT0FBTyxJQUFBLHFCQUFjLEVBQ25CLFNBQVMsQ0FBQyxRQUFRLENBQ2hCLHNCQUFzQixFQUN0QixNQUFNLENBQ1AsQ0FBQyxNQUFNLENBQ1QsQ0FBQztvQkFDSixDQUFDO29CQUNELEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxNQUFjO3dCQUMxQyxPQUFPLElBQUEscUJBQWMsRUFDbkIsU0FBUyxDQUFDLFFBQVEsQ0FDaEIsMkJBQTJCLEVBQzNCLE1BQU0sQ0FDUCxDQUFDLE1BQU0sQ0FDVCxDQUFDO29CQUNKLENBQUM7b0JBQ0QsS0FBSyxDQUFDLGVBQWUsQ0FDbkIsT0FBd0IsRUFDeEIsV0FBbUI7d0JBRW5CLE9BQU8sSUFBQSxxQkFBYyxFQUNuQixTQUFTLENBQUMsUUFBUSxDQUNoQixtQkFBbUIsRUFDbkIsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQ3ZCLENBQUMsTUFBTSxDQUNULENBQUM7b0JBQ0osQ0FBQztvQkFDRCxhQUFhO3dCQUNYLFFBQVEsWUFBWSxFQUFFOzRCQUNwQixLQUFLLDBCQUFvQixDQUFDLE9BQU8sQ0FBQzs0QkFDbEMsS0FBSywwQkFBb0IsQ0FBQyxPQUFPO2dDQUMvQixRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQW9CLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0NBQzlFLE1BQU07eUJBQ1Q7b0JBQ0gsQ0FBQztvQkFDRCxZQUFZLENBQUMsTUFBYzt3QkFDekIsUUFBUSxZQUFZLEVBQUU7NEJBQ3BCLEtBQUssMEJBQW9CLENBQUMsT0FBTztnQ0FDL0IsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dDQUNuRSxNQUFNOzRCQUNSLEtBQUssMEJBQW9CLENBQUMsT0FBTztnQ0FDL0IsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztnQ0FDbkQsTUFBTTt5QkFDVDtvQkFDSCxDQUFDO29CQUNELGNBQWMsQ0FBQyxPQUFlLEVBQUUsS0FBYyxFQUFFLE1BQWU7d0JBQzdELFFBQVEsWUFBWSxFQUFFOzRCQUNwQixLQUFLLDBCQUFvQixDQUFDLE9BQU87Z0NBQy9CLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQzt5QkFDdEU7b0JBQ0gsQ0FBQztvQkFDRCxXQUFXLENBQUMsUUFBb0M7d0JBQzlDLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ2hDLENBQUM7aUJBQ0YsQ0FBQztnQkFFRixPQUFPLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3hCLElBQUksTUFBTSxDQUFDO2dCQUNYLElBQUk7b0JBQ0YsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBMEIsRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDbkQsSUFBSSxJQUFBLHFCQUFlLEVBQUMsTUFBTSxDQUFDLEVBQUU7d0JBQzNCLE1BQU0sR0FBRyxJQUFBLFNBQUUsRUFBQyxNQUFNLENBQUMsQ0FBQztxQkFDckI7eUJBQU0sSUFBSSxDQUFDLElBQUEsbUJBQVksRUFBQyxNQUFNLENBQUMsSUFBSSxlQUFlLENBQUMsTUFBTSxDQUFDLEVBQUU7d0JBQzNELE1BQU0sR0FBRyxJQUFBLHVCQUFpQixFQUFDLE1BQU0sQ0FBQyxDQUFDO3FCQUNwQzt5QkFBTTt3QkFDTCxNQUFNLEdBQUcsSUFBQSxXQUFJLEVBQUMsTUFBTSxDQUFDLENBQUM7cUJBQ3ZCO2lCQUNGO2dCQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUNWLE1BQU0sR0FBRyxJQUFBLGlCQUFVLEVBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3hCO2dCQUVELG1DQUFtQztnQkFDbkMsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUFvQixDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDakYsYUFBYSxDQUFDLElBQUksQ0FDaEIsTUFBTTtxQkFDSCxJQUFJLENBQ0gsSUFBQSxxQkFBYyxFQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBYSxDQUFDLEVBQzdDLElBQUEsVUFBRyxFQUFDLEdBQUcsRUFBRTtvQkFDUCxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQW9CLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDM0UsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUFvQixDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM3RCxDQUFDLENBQUMsRUFDRixJQUFBLGVBQVEsRUFBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7b0JBQ3ZCLCtCQUErQjtvQkFDL0IsTUFBTSxJQUFJLE9BQU8sQ0FBTyxZQUFZLENBQUMsQ0FBQztvQkFFdEMsT0FBTyxLQUFLLENBQUM7Z0JBQ2YsQ0FBQyxDQUFDLENBQ0g7cUJBQ0EsU0FBUyxDQUNSLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQWUsQ0FBQyxFQUMzQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFDaEMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUMxQixDQUNKLENBQUM7WUFDSixDQUFDO1lBRUQsT0FBTyxHQUFHLEVBQUU7Z0JBQ1YsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQzlDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0wsT0FBTztRQUNQLENBQUMsd0JBQWEsQ0FBQyxFQUFFLElBQUk7UUFDckIsQ0FBQywrQkFBb0IsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE9BQU87S0FDM0QsQ0FBQztBQUNKLENBQUM7QUFwT0Qsc0NBb09DO0FBRUQsU0FBUyxlQUFlLENBQUksR0FBWTtJQUN0QyxPQUFPLENBQUMsQ0FBQyxHQUFHLElBQUksT0FBUSxHQUF3QixDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxVQUFVLENBQUM7QUFDeEYsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBqc29uLCBsb2dnaW5nIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHtcbiAgT2JzZXJ2YWJsZSxcbiAgU3Vic2NyaXB0aW9uLFxuICBkZWZhdWx0SWZFbXB0eSxcbiAgZmlyc3RWYWx1ZUZyb20sXG4gIGZyb20sXG4gIGlzT2JzZXJ2YWJsZSxcbiAgbWVyZ2VNYXAsXG4gIG9mLFxuICB0YXAsXG4gIHRocm93RXJyb3IsXG59IGZyb20gJ3J4anMnO1xuaW1wb3J0IHtcbiAgQnVpbGRlckNvbnRleHQsXG4gIEJ1aWxkZXJIYW5kbGVyRm4sXG4gIEJ1aWxkZXJJbmZvLFxuICBCdWlsZGVySW5wdXQsXG4gIEJ1aWxkZXJPdXRwdXQsXG4gIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLFxuICBTY2hlZHVsZU9wdGlvbnMsXG4gIFRhcmdldCxcbiAgVHlwZWRCdWlsZGVyUHJvZ3Jlc3MsXG4gIGZyb21Bc3luY0l0ZXJhYmxlLFxuICBpc0J1aWxkZXJPdXRwdXQsXG4gIHRhcmdldFN0cmluZ0Zyb21UYXJnZXQsXG59IGZyb20gJy4vYXBpJztcbmltcG9ydCB7IEJ1aWxkZXIsIEJ1aWxkZXJTeW1ib2wsIEJ1aWxkZXJWZXJzaW9uU3ltYm9sIH0gZnJvbSAnLi9pbnRlcm5hbCc7XG5pbXBvcnQgeyBKb2JJbmJvdW5kTWVzc2FnZUtpbmQsIGNyZWF0ZUpvYkhhbmRsZXIgfSBmcm9tICcuL2pvYnMnO1xuaW1wb3J0IHsgc2NoZWR1bGVCeU5hbWUsIHNjaGVkdWxlQnlUYXJnZXQgfSBmcm9tICcuL3NjaGVkdWxlLWJ5LW5hbWUnO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbWF4LWxpbmVzLXBlci1mdW5jdGlvblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJ1aWxkZXI8T3B0VCA9IGpzb24uSnNvbk9iamVjdCwgT3V0VCBleHRlbmRzIEJ1aWxkZXJPdXRwdXQgPSBCdWlsZGVyT3V0cHV0PihcbiAgZm46IEJ1aWxkZXJIYW5kbGVyRm48T3B0VD4sXG4pOiBCdWlsZGVyPE9wdFQgJiBqc29uLkpzb25PYmplY3Q+IHtcbiAgY29uc3QgY2poID0gY3JlYXRlSm9iSGFuZGxlcjtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG1heC1saW5lcy1wZXItZnVuY3Rpb25cbiAgY29uc3QgaGFuZGxlciA9IGNqaDxqc29uLkpzb25PYmplY3QsIEJ1aWxkZXJJbnB1dCwgT3V0VD4oKG9wdGlvbnMsIGNvbnRleHQpID0+IHtcbiAgICBjb25zdCBzY2hlZHVsZXIgPSBjb250ZXh0LnNjaGVkdWxlcjtcbiAgICBjb25zdCBwcm9ncmVzc0NoYW5uZWwgPSBjb250ZXh0LmNyZWF0ZUNoYW5uZWwoJ3Byb2dyZXNzJyk7XG4gICAgY29uc3QgbG9nQ2hhbm5lbCA9IGNvbnRleHQuY3JlYXRlQ2hhbm5lbCgnbG9nJyk7XG4gICAgbGV0IGN1cnJlbnRTdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUgPSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5TdG9wcGVkO1xuICAgIGNvbnN0IHRlYXJkb3duTG9naWNzOiBBcnJheTwoKSA9PiBQcm9taXNlTGlrZTx2b2lkPiB8IHZvaWQ+ID0gW107XG4gICAgbGV0IHRlYXJpbmdEb3duID0gZmFsc2U7XG4gICAgbGV0IGN1cnJlbnQgPSAwO1xuICAgIGxldCBzdGF0dXMgPSAnJztcbiAgICBsZXQgdG90YWwgPSAxO1xuXG4gICAgZnVuY3Rpb24gbG9nKGVudHJ5OiBsb2dnaW5nLkxvZ0VudHJ5KSB7XG4gICAgICBsb2dDaGFubmVsLm5leHQoZW50cnkpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwcm9ncmVzcyhwcm9ncmVzczogVHlwZWRCdWlsZGVyUHJvZ3Jlc3MsIGNvbnRleHQ6IEJ1aWxkZXJDb250ZXh0KSB7XG4gICAgICBjdXJyZW50U3RhdGUgPSBwcm9ncmVzcy5zdGF0ZTtcbiAgICAgIGlmIChwcm9ncmVzcy5zdGF0ZSA9PT0gQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZykge1xuICAgICAgICBjdXJyZW50ID0gcHJvZ3Jlc3MuY3VycmVudDtcbiAgICAgICAgdG90YWwgPSBwcm9ncmVzcy50b3RhbCAhPT0gdW5kZWZpbmVkID8gcHJvZ3Jlc3MudG90YWwgOiB0b3RhbDtcblxuICAgICAgICBpZiAocHJvZ3Jlc3Muc3RhdHVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwcm9ncmVzcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdHVzID0gcHJvZ3Jlc3Muc3RhdHVzO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHByb2dyZXNzQ2hhbm5lbC5uZXh0KHtcbiAgICAgICAgLi4uKHByb2dyZXNzIGFzIGpzb24uSnNvbk9iamVjdCksXG4gICAgICAgIC4uLihjb250ZXh0LnRhcmdldCAmJiB7IHRhcmdldDogY29udGV4dC50YXJnZXQgfSksXG4gICAgICAgIC4uLihjb250ZXh0LmJ1aWxkZXIgJiYgeyBidWlsZGVyOiBjb250ZXh0LmJ1aWxkZXIgfSksXG4gICAgICAgIGlkOiBjb250ZXh0LmlkLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPE91dFQ+KChvYnNlcnZlcikgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uczogU3Vic2NyaXB0aW9uW10gPSBbXTtcblxuICAgICAgY29uc3QgaW5wdXRTdWJzY3JpcHRpb24gPSBjb250ZXh0LmluYm91bmRCdXMuc3Vic2NyaWJlKChpKSA9PiB7XG4gICAgICAgIHN3aXRjaCAoaS5raW5kKSB7XG4gICAgICAgICAgY2FzZSBKb2JJbmJvdW5kTWVzc2FnZUtpbmQuU3RvcDpcbiAgICAgICAgICAgIC8vIFJ1biB0ZWFyZG93biBsb2dpYyB0aGVuIGNvbXBsZXRlLlxuICAgICAgICAgICAgdGVhcmluZ0Rvd24gPSB0cnVlO1xuICAgICAgICAgICAgUHJvbWlzZS5hbGwodGVhcmRvd25Mb2dpY3MubWFwKChmbikgPT4gZm4oKSB8fCBQcm9taXNlLnJlc29sdmUoKSkpLnRoZW4oXG4gICAgICAgICAgICAgICgpID0+IG9ic2VydmVyLmNvbXBsZXRlKCksXG4gICAgICAgICAgICAgIChlcnIpID0+IG9ic2VydmVyLmVycm9yKGVyciksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBKb2JJbmJvdW5kTWVzc2FnZUtpbmQuSW5wdXQ6XG4gICAgICAgICAgICBpZiAoIXRlYXJpbmdEb3duKSB7XG4gICAgICAgICAgICAgIG9uSW5wdXQoaS52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGZ1bmN0aW9uIG9uSW5wdXQoaTogQnVpbGRlcklucHV0KSB7XG4gICAgICAgIGNvbnN0IGJ1aWxkZXIgPSBpLmluZm8gYXMgQnVpbGRlckluZm87XG4gICAgICAgIGNvbnN0IGxvZ2dlck5hbWUgPSBpLnRhcmdldFxuICAgICAgICAgID8gdGFyZ2V0U3RyaW5nRnJvbVRhcmdldChpLnRhcmdldCBhcyBUYXJnZXQpXG4gICAgICAgICAgOiBidWlsZGVyLmJ1aWxkZXJOYW1lO1xuICAgICAgICBjb25zdCBsb2dnZXIgPSBuZXcgbG9nZ2luZy5Mb2dnZXIobG9nZ2VyTmFtZSk7XG5cbiAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKGxvZ2dlci5zdWJzY3JpYmUoKGVudHJ5KSA9PiBsb2coZW50cnkpKSk7XG5cbiAgICAgICAgY29uc3QgY29udGV4dDogQnVpbGRlckNvbnRleHQgPSB7XG4gICAgICAgICAgYnVpbGRlcixcbiAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgY3VycmVudERpcmVjdG9yeTogaS5jdXJyZW50RGlyZWN0b3J5LFxuICAgICAgICAgIHRhcmdldDogaS50YXJnZXQgYXMgVGFyZ2V0LFxuICAgICAgICAgIGxvZ2dlcjogbG9nZ2VyLFxuICAgICAgICAgIGlkOiBpLmlkLFxuICAgICAgICAgIGFzeW5jIHNjaGVkdWxlVGFyZ2V0KFxuICAgICAgICAgICAgdGFyZ2V0OiBUYXJnZXQsXG4gICAgICAgICAgICBvdmVycmlkZXM6IGpzb24uSnNvbk9iamVjdCA9IHt9LFxuICAgICAgICAgICAgc2NoZWR1bGVPcHRpb25zOiBTY2hlZHVsZU9wdGlvbnMgPSB7fSxcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGNvbnN0IHJ1biA9IGF3YWl0IHNjaGVkdWxlQnlUYXJnZXQodGFyZ2V0LCBvdmVycmlkZXMsIHtcbiAgICAgICAgICAgICAgc2NoZWR1bGVyLFxuICAgICAgICAgICAgICBsb2dnZXI6IHNjaGVkdWxlT3B0aW9ucy5sb2dnZXIgfHwgbG9nZ2VyLmNyZWF0ZUNoaWxkKCcnKSxcbiAgICAgICAgICAgICAgd29ya3NwYWNlUm9vdDogaS53b3Jrc3BhY2VSb290LFxuICAgICAgICAgICAgICBjdXJyZW50RGlyZWN0b3J5OiBpLmN1cnJlbnREaXJlY3RvcnksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2UgZG9uJ3Qgd2FudCB0byBzdWJzY3JpYmUgZXJyb3JzIGFuZCBjb21wbGV0ZS5cbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChydW4ucHJvZ3Jlc3Muc3Vic2NyaWJlKChldmVudCkgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBzY2hlZHVsZUJ1aWxkZXIoXG4gICAgICAgICAgICBidWlsZGVyTmFtZTogc3RyaW5nLFxuICAgICAgICAgICAgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0ID0ge30sXG4gICAgICAgICAgICBzY2hlZHVsZU9wdGlvbnM6IFNjaGVkdWxlT3B0aW9ucyA9IHt9LFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgY29uc3QgcnVuID0gYXdhaXQgc2NoZWR1bGVCeU5hbWUoYnVpbGRlck5hbWUsIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgc2NoZWR1bGVyLFxuICAgICAgICAgICAgICB0YXJnZXQ6IHNjaGVkdWxlT3B0aW9ucy50YXJnZXQsXG4gICAgICAgICAgICAgIGxvZ2dlcjogc2NoZWR1bGVPcHRpb25zLmxvZ2dlciB8fCBsb2dnZXIuY3JlYXRlQ2hpbGQoJycpLFxuICAgICAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN1YnNjcmliZSBlcnJvcnMgYW5kIGNvbXBsZXRlLlxuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKHJ1bi5wcm9ncmVzcy5zdWJzY3JpYmUoKGV2ZW50KSA9PiBwcm9ncmVzc0NoYW5uZWwubmV4dChldmVudCkpKTtcblxuICAgICAgICAgICAgcmV0dXJuIHJ1bjtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFzeW5jIGdldFRhcmdldE9wdGlvbnModGFyZ2V0OiBUYXJnZXQpIHtcbiAgICAgICAgICAgIHJldHVybiBmaXJzdFZhbHVlRnJvbShcbiAgICAgICAgICAgICAgc2NoZWR1bGVyLnNjaGVkdWxlPFRhcmdldCwganNvbi5Kc29uVmFsdWUsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgICAgICAgICAgICAgJy4uZ2V0VGFyZ2V0T3B0aW9ucycsXG4gICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICApLm91dHB1dCxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBnZXRQcm9qZWN0TWV0YWRhdGEodGFyZ2V0OiBUYXJnZXQgfCBzdHJpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBmaXJzdFZhbHVlRnJvbShcbiAgICAgICAgICAgICAgc2NoZWR1bGVyLnNjaGVkdWxlPFRhcmdldCB8IHN0cmluZywganNvbi5Kc29uVmFsdWUsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgICAgICAgICAgICAgJy4uZ2V0UHJvamVjdE1ldGFkYXRhJyxcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICkub3V0cHV0LFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFzeW5jIGdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KSB7XG4gICAgICAgICAgICByZXR1cm4gZmlyc3RWYWx1ZUZyb20oXG4gICAgICAgICAgICAgIHNjaGVkdWxlci5zY2hlZHVsZTxUYXJnZXQsIGpzb24uSnNvblZhbHVlLCBzdHJpbmc+KFxuICAgICAgICAgICAgICAgICcuLmdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0JyxcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICkub3V0cHV0LFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFzeW5jIHZhbGlkYXRlT3B0aW9uczxUIGV4dGVuZHMganNvbi5Kc29uT2JqZWN0ID0ganNvbi5Kc29uT2JqZWN0PihcbiAgICAgICAgICAgIG9wdGlvbnM6IGpzb24uSnNvbk9iamVjdCxcbiAgICAgICAgICAgIGJ1aWxkZXJOYW1lOiBzdHJpbmcsXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gZmlyc3RWYWx1ZUZyb20oXG4gICAgICAgICAgICAgIHNjaGVkdWxlci5zY2hlZHVsZTxbc3RyaW5nLCBqc29uLkpzb25PYmplY3RdLCBqc29uLkpzb25WYWx1ZSwgVD4oXG4gICAgICAgICAgICAgICAgJy4udmFsaWRhdGVPcHRpb25zJyxcbiAgICAgICAgICAgICAgICBbYnVpbGRlck5hbWUsIG9wdGlvbnNdLFxuICAgICAgICAgICAgICApLm91dHB1dCxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRSdW5uaW5nKCkge1xuICAgICAgICAgICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5XYWl0aW5nOlxuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlN0b3BwZWQ6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogMCwgdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRTdGF0dXMoc3RhdHVzOiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIHN0YXR1cywgY3VycmVudCwgdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuV2FpdGluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIHN0YXR1cyB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlcG9ydFByb2dyZXNzKGN1cnJlbnQ6IG51bWJlciwgdG90YWw/OiBudW1iZXIsIHN0YXR1cz86IHN0cmluZykge1xuICAgICAgICAgICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nOlxuICAgICAgICAgICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IGN1cnJlbnRTdGF0ZSwgY3VycmVudCwgdG90YWwsIHN0YXR1cyB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGFkZFRlYXJkb3duKHRlYXJkb3duOiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZCk6IHZvaWQge1xuICAgICAgICAgICAgdGVhcmRvd25Mb2dpY3MucHVzaCh0ZWFyZG93bik7XG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBjb250ZXh0LnJlcG9ydFJ1bm5pbmcoKTtcbiAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXN1bHQgPSBmbihpLm9wdGlvbnMgYXMgdW5rbm93biBhcyBPcHRULCBjb250ZXh0KTtcbiAgICAgICAgICBpZiAoaXNCdWlsZGVyT3V0cHV0KHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IG9mKHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIGlmICghaXNPYnNlcnZhYmxlKHJlc3VsdCkgJiYgaXNBc3luY0l0ZXJhYmxlKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZyb21Bc3luY0l0ZXJhYmxlKHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZyb20ocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXN1bHQgPSB0aHJvd0Vycm9yKGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWFuYWdlIHNvbWUgc3RhdGUgYXV0b21hdGljYWxseS5cbiAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogMCwgdG90YWw6IDEgfSwgY29udGV4dCk7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChcbiAgICAgICAgICByZXN1bHRcbiAgICAgICAgICAgIC5waXBlKFxuICAgICAgICAgICAgICBkZWZhdWx0SWZFbXB0eSh7IHN1Y2Nlc3M6IGZhbHNlIH0gYXMgdW5rbm93biksXG4gICAgICAgICAgICAgIHRhcCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZCB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIG1lcmdlTWFwKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEFsbG93IHRoZSBsb2cgcXVldWUgdG8gZmx1c2hcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihzZXRJbW1lZGlhdGUpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC5zdWJzY3JpYmUoXG4gICAgICAgICAgICAgIChtZXNzYWdlKSA9PiBvYnNlcnZlci5uZXh0KG1lc3NhZ2UgYXMgT3V0VCksXG4gICAgICAgICAgICAgIChlcnJvcikgPT4gb2JzZXJ2ZXIuZXJyb3IoZXJyb3IpLFxuICAgICAgICAgICAgICAoKSA9PiBvYnNlcnZlci5jb21wbGV0ZSgpLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgc3Vic2NyaXB0aW9ucy5mb3JFYWNoKCh4KSA9PiB4LnVuc3Vic2NyaWJlKCkpO1xuICAgICAgICBpbnB1dFN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBoYW5kbGVyLFxuICAgIFtCdWlsZGVyU3ltYm9sXTogdHJ1ZSxcbiAgICBbQnVpbGRlclZlcnNpb25TeW1ib2xdOiByZXF1aXJlKCcuLi9wYWNrYWdlLmpzb24nKS52ZXJzaW9uLFxuICB9O1xufVxuXG5mdW5jdGlvbiBpc0FzeW5jSXRlcmFibGU8VD4ob2JqOiB1bmtub3duKTogb2JqIGlzIEFzeW5jSXRlcmFibGU8VD4ge1xuICByZXR1cm4gISFvYmogJiYgdHlwZW9mIChvYmogYXMgQXN5bmNJdGVyYWJsZTxUPilbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID09PSAnZnVuY3Rpb24nO1xufVxuIl19