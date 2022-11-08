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
const operators_1 = require("rxjs/operators");
const api_1 = require("./api");
const internal_1 = require("./internal");
const schedule_by_name_1 = require("./schedule-by-name");
// eslint-disable-next-line max-lines-per-function
function createBuilder(fn) {
    const cjh = core_1.experimental.jobs.createJobHandler;
    // eslint-disable-next-line max-lines-per-function
    const handler = cjh((options, context) => {
        const scheduler = context.scheduler;
        const progressChannel = context.createChannel('progress');
        const logChannel = context.createChannel('log');
        const analyticsChannel = context.createChannel('analytics');
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
                    case core_1.experimental.jobs.JobInboundMessageKind.Stop:
                        // Run teardown logic then complete.
                        tearingDown = true;
                        Promise.all(teardownLogics.map((fn) => fn() || Promise.resolve())).then(() => observer.complete(), (err) => observer.error(err));
                        break;
                    case core_1.experimental.jobs.JobInboundMessageKind.Input:
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
                        return scheduler
                            .schedule('..getTargetOptions', target)
                            .output.toPromise();
                    },
                    async getProjectMetadata(target) {
                        return scheduler
                            .schedule('..getProjectMetadata', target)
                            .output.toPromise();
                    },
                    async getBuilderNameForTarget(target) {
                        return scheduler
                            .schedule('..getBuilderNameForTarget', target)
                            .output.toPromise();
                    },
                    async validateOptions(options, builderName) {
                        return scheduler
                            .schedule('..validateOptions', [
                            builderName,
                            options,
                        ])
                            .output.toPromise();
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
                    analytics: new core_1.analytics.ForwardingAnalytics((report) => analyticsChannel.next(report)),
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
                    .pipe((0, operators_1.defaultIfEmpty)({ success: false }), (0, operators_1.tap)(() => {
                    progress({ state: api_1.BuilderProgressState.Running, current: total }, context);
                    progress({ state: api_1.BuilderProgressState.Stopped }, context);
                }), (0, operators_1.mergeMap)(async (value) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9hcmNoaXRlY3Qvc3JjL2NyZWF0ZS1idWlsZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7OztBQUVILCtDQUE4RTtBQUM5RSwrQkFBb0Y7QUFDcEYsOENBQStEO0FBQy9ELCtCQWFlO0FBQ2YseUNBQTBFO0FBQzFFLHlEQUFzRTtBQUV0RSxrREFBa0Q7QUFDbEQsU0FBZ0IsYUFBYSxDQUMzQixFQUEwQjtJQUUxQixNQUFNLEdBQUcsR0FBRyxtQkFBWSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQyxrREFBa0Q7SUFDbEQsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFzQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRTtRQUM1RSxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBQ3BDLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUQsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoRCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDNUQsSUFBSSxZQUFZLEdBQXlCLDBCQUFvQixDQUFDLE9BQU8sQ0FBQztRQUN0RSxNQUFNLGNBQWMsR0FBMEMsRUFBRSxDQUFDO1FBQ2pFLElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQztRQUN4QixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDaEIsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUVkLFNBQVMsR0FBRyxDQUFDLEtBQXVCO1lBQ2xDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FB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QUMsQ0FBQztvQkFFdEMsT0FBTyxLQUFLLENBQUM7Z0JBQ2YsQ0FBQyxDQUFDLENBQ0g7cUJBQ0EsU0FBUyxDQUNSLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQWUsQ0FBQyxFQUMzQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFDaEMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUMxQixDQUNKLENBQUM7WUFDSixDQUFDO1lBRUQsT0FBTyxHQUFHLEVBQUU7Z0JBQ1YsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQzlDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0wsT0FBTztRQUNQLENBQUMsd0JBQWEsQ0FBQyxFQUFFLElBQUk7UUFDckIsQ0FBQywrQkFBb0IsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE9BQU87S0FDM0QsQ0FBQztBQUNKLENBQUM7QUFoT0Qsc0NBZ09DO0FBRUQsU0FBUyxlQUFlLENBQUksR0FBWTtJQUN0QyxPQUFPLENBQUMsQ0FBQyxHQUFHLElBQUksT0FBUSxHQUF3QixDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxVQUFVLENBQUM7QUFDeEYsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBhbmFseXRpY3MsIGV4cGVyaW1lbnRhbCwganNvbiwgbG9nZ2luZyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFN1YnNjcmlwdGlvbiwgZnJvbSwgaXNPYnNlcnZhYmxlLCBvZiwgdGhyb3dFcnJvciB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHsgZGVmYXVsdElmRW1wdHksIG1lcmdlTWFwLCB0YXAgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQge1xuICBCdWlsZGVyQ29udGV4dCxcbiAgQnVpbGRlckhhbmRsZXJGbixcbiAgQnVpbGRlckluZm8sXG4gIEJ1aWxkZXJJbnB1dCxcbiAgQnVpbGRlck91dHB1dCxcbiAgQnVpbGRlclByb2dyZXNzU3RhdGUsXG4gIFNjaGVkdWxlT3B0aW9ucyxcbiAgVGFyZ2V0LFxuICBUeXBlZEJ1aWxkZXJQcm9ncmVzcyxcbiAgZnJvbUFzeW5jSXRlcmFibGUsXG4gIGlzQnVpbGRlck91dHB1dCxcbiAgdGFyZ2V0U3RyaW5nRnJvbVRhcmdldCxcbn0gZnJvbSAnLi9hcGknO1xuaW1wb3J0IHsgQnVpbGRlciwgQnVpbGRlclN5bWJvbCwgQnVpbGRlclZlcnNpb25TeW1ib2wgfSBmcm9tICcuL2ludGVybmFsJztcbmltcG9ydCB7IHNjaGVkdWxlQnlOYW1lLCBzY2hlZHVsZUJ5VGFyZ2V0IH0gZnJvbSAnLi9zY2hlZHVsZS1ieS1uYW1lJztcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG1heC1saW5lcy1wZXItZnVuY3Rpb25cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVCdWlsZGVyPE9wdFQgPSBqc29uLkpzb25PYmplY3QsIE91dFQgZXh0ZW5kcyBCdWlsZGVyT3V0cHV0ID0gQnVpbGRlck91dHB1dD4oXG4gIGZuOiBCdWlsZGVySGFuZGxlckZuPE9wdFQ+LFxuKTogQnVpbGRlcjxPcHRUICYganNvbi5Kc29uT2JqZWN0PiB7XG4gIGNvbnN0IGNqaCA9IGV4cGVyaW1lbnRhbC5qb2JzLmNyZWF0ZUpvYkhhbmRsZXI7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBtYXgtbGluZXMtcGVyLWZ1bmN0aW9uXG4gIGNvbnN0IGhhbmRsZXIgPSBjamg8anNvbi5Kc29uT2JqZWN0LCBCdWlsZGVySW5wdXQsIE91dFQ+KChvcHRpb25zLCBjb250ZXh0KSA9PiB7XG4gICAgY29uc3Qgc2NoZWR1bGVyID0gY29udGV4dC5zY2hlZHVsZXI7XG4gICAgY29uc3QgcHJvZ3Jlc3NDaGFubmVsID0gY29udGV4dC5jcmVhdGVDaGFubmVsKCdwcm9ncmVzcycpO1xuICAgIGNvbnN0IGxvZ0NoYW5uZWwgPSBjb250ZXh0LmNyZWF0ZUNoYW5uZWwoJ2xvZycpO1xuICAgIGNvbnN0IGFuYWx5dGljc0NoYW5uZWwgPSBjb250ZXh0LmNyZWF0ZUNoYW5uZWwoJ2FuYWx5dGljcycpO1xuICAgIGxldCBjdXJyZW50U3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlID0gQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZDtcbiAgICBjb25zdCB0ZWFyZG93bkxvZ2ljczogQXJyYXk8KCkgPT4gUHJvbWlzZUxpa2U8dm9pZD4gfCB2b2lkPiA9IFtdO1xuICAgIGxldCB0ZWFyaW5nRG93biA9IGZhbHNlO1xuICAgIGxldCBjdXJyZW50ID0gMDtcbiAgICBsZXQgc3RhdHVzID0gJyc7XG4gICAgbGV0IHRvdGFsID0gMTtcblxuICAgIGZ1bmN0aW9uIGxvZyhlbnRyeTogbG9nZ2luZy5Mb2dFbnRyeSkge1xuICAgICAgbG9nQ2hhbm5lbC5uZXh0KGVudHJ5KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcHJvZ3Jlc3MocHJvZ3Jlc3M6IFR5cGVkQnVpbGRlclByb2dyZXNzLCBjb250ZXh0OiBCdWlsZGVyQ29udGV4dCkge1xuICAgICAgY3VycmVudFN0YXRlID0gcHJvZ3Jlc3Muc3RhdGU7XG4gICAgICBpZiAocHJvZ3Jlc3Muc3RhdGUgPT09IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcpIHtcbiAgICAgICAgY3VycmVudCA9IHByb2dyZXNzLmN1cnJlbnQ7XG4gICAgICAgIHRvdGFsID0gcHJvZ3Jlc3MudG90YWwgIT09IHVuZGVmaW5lZCA/IHByb2dyZXNzLnRvdGFsIDogdG90YWw7XG5cbiAgICAgICAgaWYgKHByb2dyZXNzLnN0YXR1cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcHJvZ3Jlc3Muc3RhdHVzID0gc3RhdHVzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXR1cyA9IHByb2dyZXNzLnN0YXR1cztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwcm9ncmVzc0NoYW5uZWwubmV4dCh7XG4gICAgICAgIC4uLihwcm9ncmVzcyBhcyBqc29uLkpzb25PYmplY3QpLFxuICAgICAgICAuLi4oY29udGV4dC50YXJnZXQgJiYgeyB0YXJnZXQ6IGNvbnRleHQudGFyZ2V0IH0pLFxuICAgICAgICAuLi4oY29udGV4dC5idWlsZGVyICYmIHsgYnVpbGRlcjogY29udGV4dC5idWlsZGVyIH0pLFxuICAgICAgICBpZDogY29udGV4dC5pZCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgT2JzZXJ2YWJsZTxPdXRUPigob2JzZXJ2ZXIpID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbnM6IFN1YnNjcmlwdGlvbltdID0gW107XG5cbiAgICAgIGNvbnN0IGlucHV0U3Vic2NyaXB0aW9uID0gY29udGV4dC5pbmJvdW5kQnVzLnN1YnNjcmliZSgoaSkgPT4ge1xuICAgICAgICBzd2l0Y2ggKGkua2luZCkge1xuICAgICAgICAgIGNhc2UgZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLlN0b3A6XG4gICAgICAgICAgICAvLyBSdW4gdGVhcmRvd24gbG9naWMgdGhlbiBjb21wbGV0ZS5cbiAgICAgICAgICAgIHRlYXJpbmdEb3duID0gdHJ1ZTtcbiAgICAgICAgICAgIFByb21pc2UuYWxsKHRlYXJkb3duTG9naWNzLm1hcCgoZm4pID0+IGZuKCkgfHwgUHJvbWlzZS5yZXNvbHZlKCkpKS50aGVuKFxuICAgICAgICAgICAgICAoKSA9PiBvYnNlcnZlci5jb21wbGV0ZSgpLFxuICAgICAgICAgICAgICAoZXJyKSA9PiBvYnNlcnZlci5lcnJvcihlcnIpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLklucHV0OlxuICAgICAgICAgICAgaWYgKCF0ZWFyaW5nRG93bikge1xuICAgICAgICAgICAgICBvbklucHV0KGkudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBmdW5jdGlvbiBvbklucHV0KGk6IEJ1aWxkZXJJbnB1dCkge1xuICAgICAgICBjb25zdCBidWlsZGVyID0gaS5pbmZvIGFzIEJ1aWxkZXJJbmZvO1xuICAgICAgICBjb25zdCBsb2dnZXJOYW1lID0gaS50YXJnZXRcbiAgICAgICAgICA/IHRhcmdldFN0cmluZ0Zyb21UYXJnZXQoaS50YXJnZXQgYXMgVGFyZ2V0KVxuICAgICAgICAgIDogYnVpbGRlci5idWlsZGVyTmFtZTtcbiAgICAgICAgY29uc3QgbG9nZ2VyID0gbmV3IGxvZ2dpbmcuTG9nZ2VyKGxvZ2dlck5hbWUpO1xuXG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChsb2dnZXIuc3Vic2NyaWJlKChlbnRyeSkgPT4gbG9nKGVudHJ5KSkpO1xuXG4gICAgICAgIGNvbnN0IGNvbnRleHQ6IEJ1aWxkZXJDb250ZXh0ID0ge1xuICAgICAgICAgIGJ1aWxkZXIsXG4gICAgICAgICAgd29ya3NwYWNlUm9vdDogaS53b3Jrc3BhY2VSb290LFxuICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICB0YXJnZXQ6IGkudGFyZ2V0IGFzIFRhcmdldCxcbiAgICAgICAgICBsb2dnZXI6IGxvZ2dlcixcbiAgICAgICAgICBpZDogaS5pZCxcbiAgICAgICAgICBhc3luYyBzY2hlZHVsZVRhcmdldChcbiAgICAgICAgICAgIHRhcmdldDogVGFyZ2V0LFxuICAgICAgICAgICAgb3ZlcnJpZGVzOiBqc29uLkpzb25PYmplY3QgPSB7fSxcbiAgICAgICAgICAgIHNjaGVkdWxlT3B0aW9uczogU2NoZWR1bGVPcHRpb25zID0ge30sXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zdCBydW4gPSBhd2FpdCBzY2hlZHVsZUJ5VGFyZ2V0KHRhcmdldCwgb3ZlcnJpZGVzLCB7XG4gICAgICAgICAgICAgIHNjaGVkdWxlcixcbiAgICAgICAgICAgICAgbG9nZ2VyOiBzY2hlZHVsZU9wdGlvbnMubG9nZ2VyIHx8IGxvZ2dlci5jcmVhdGVDaGlsZCgnJyksXG4gICAgICAgICAgICAgIHdvcmtzcGFjZVJvb3Q6IGkud29ya3NwYWNlUm9vdCxcbiAgICAgICAgICAgICAgY3VycmVudERpcmVjdG9yeTogaS5jdXJyZW50RGlyZWN0b3J5LFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gc3Vic2NyaWJlIGVycm9ycyBhbmQgY29tcGxldGUuXG4gICAgICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gocnVuLnByb2dyZXNzLnN1YnNjcmliZSgoZXZlbnQpID0+IHByb2dyZXNzQ2hhbm5lbC5uZXh0KGV2ZW50KSkpO1xuXG4gICAgICAgICAgICByZXR1cm4gcnVuO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgYXN5bmMgc2NoZWR1bGVCdWlsZGVyKFxuICAgICAgICAgICAgYnVpbGRlck5hbWU6IHN0cmluZyxcbiAgICAgICAgICAgIG9wdGlvbnM6IGpzb24uSnNvbk9iamVjdCA9IHt9LFxuICAgICAgICAgICAgc2NoZWR1bGVPcHRpb25zOiBTY2hlZHVsZU9wdGlvbnMgPSB7fSxcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGNvbnN0IHJ1biA9IGF3YWl0IHNjaGVkdWxlQnlOYW1lKGJ1aWxkZXJOYW1lLCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgIHNjaGVkdWxlcixcbiAgICAgICAgICAgICAgdGFyZ2V0OiBzY2hlZHVsZU9wdGlvbnMudGFyZ2V0LFxuICAgICAgICAgICAgICBsb2dnZXI6IHNjaGVkdWxlT3B0aW9ucy5sb2dnZXIgfHwgbG9nZ2VyLmNyZWF0ZUNoaWxkKCcnKSxcbiAgICAgICAgICAgICAgd29ya3NwYWNlUm9vdDogaS53b3Jrc3BhY2VSb290LFxuICAgICAgICAgICAgICBjdXJyZW50RGlyZWN0b3J5OiBpLmN1cnJlbnREaXJlY3RvcnksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2UgZG9uJ3Qgd2FudCB0byBzdWJzY3JpYmUgZXJyb3JzIGFuZCBjb21wbGV0ZS5cbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChydW4ucHJvZ3Jlc3Muc3Vic2NyaWJlKChldmVudCkgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBnZXRUYXJnZXRPcHRpb25zKHRhcmdldDogVGFyZ2V0KSB7XG4gICAgICAgICAgICByZXR1cm4gc2NoZWR1bGVyXG4gICAgICAgICAgICAgIC5zY2hlZHVsZTxUYXJnZXQsIGpzb24uSnNvblZhbHVlLCBqc29uLkpzb25PYmplY3Q+KCcuLmdldFRhcmdldE9wdGlvbnMnLCB0YXJnZXQpXG4gICAgICAgICAgICAgIC5vdXRwdXQudG9Qcm9taXNlKCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBnZXRQcm9qZWN0TWV0YWRhdGEodGFyZ2V0OiBUYXJnZXQgfCBzdHJpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBzY2hlZHVsZXJcbiAgICAgICAgICAgICAgLnNjaGVkdWxlPFRhcmdldCB8IHN0cmluZywganNvbi5Kc29uVmFsdWUsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgICAgICAgICAgICAgJy4uZ2V0UHJvamVjdE1ldGFkYXRhJyxcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLm91dHB1dC50b1Byb21pc2UoKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFzeW5jIGdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KSB7XG4gICAgICAgICAgICByZXR1cm4gc2NoZWR1bGVyXG4gICAgICAgICAgICAgIC5zY2hlZHVsZTxUYXJnZXQsIGpzb24uSnNvblZhbHVlLCBzdHJpbmc+KCcuLmdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0JywgdGFyZ2V0KVxuICAgICAgICAgICAgICAub3V0cHV0LnRvUHJvbWlzZSgpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgYXN5bmMgdmFsaWRhdGVPcHRpb25zPFQgZXh0ZW5kcyBqc29uLkpzb25PYmplY3QgPSBqc29uLkpzb25PYmplY3Q+KFxuICAgICAgICAgICAgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0LFxuICAgICAgICAgICAgYnVpbGRlck5hbWU6IHN0cmluZyxcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBzY2hlZHVsZXJcbiAgICAgICAgICAgICAgLnNjaGVkdWxlPFtzdHJpbmcsIGpzb24uSnNvbk9iamVjdF0sIGpzb24uSnNvblZhbHVlLCBUPignLi52YWxpZGF0ZU9wdGlvbnMnLCBbXG4gICAgICAgICAgICAgICAgYnVpbGRlck5hbWUsXG4gICAgICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICAgICAgXSlcbiAgICAgICAgICAgICAgLm91dHB1dC50b1Byb21pc2UoKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlcG9ydFJ1bm5pbmcoKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLldhaXRpbmc6XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZDpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nLCBjdXJyZW50OiAwLCB0b3RhbCB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlcG9ydFN0YXR1cyhzdGF0dXM6IHN0cmluZykge1xuICAgICAgICAgICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nOlxuICAgICAgICAgICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IGN1cnJlbnRTdGF0ZSwgc3RhdHVzLCBjdXJyZW50LCB0b3RhbCB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5XYWl0aW5nOlxuICAgICAgICAgICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IGN1cnJlbnRTdGF0ZSwgc3RhdHVzIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVwb3J0UHJvZ3Jlc3MoY3VycmVudDogbnVtYmVyLCB0b3RhbD86IG51bWJlciwgc3RhdHVzPzogc3RyaW5nKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBjdXJyZW50LCB0b3RhbCwgc3RhdHVzIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYW5hbHl0aWNzOiBuZXcgYW5hbHl0aWNzLkZvcndhcmRpbmdBbmFseXRpY3MoKHJlcG9ydCkgPT4gYW5hbHl0aWNzQ2hhbm5lbC5uZXh0KHJlcG9ydCkpLFxuICAgICAgICAgIGFkZFRlYXJkb3duKHRlYXJkb3duOiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZCk6IHZvaWQge1xuICAgICAgICAgICAgdGVhcmRvd25Mb2dpY3MucHVzaCh0ZWFyZG93bik7XG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBjb250ZXh0LnJlcG9ydFJ1bm5pbmcoKTtcbiAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXN1bHQgPSBmbihpLm9wdGlvbnMgYXMgdW5rbm93biBhcyBPcHRULCBjb250ZXh0KTtcbiAgICAgICAgICBpZiAoaXNCdWlsZGVyT3V0cHV0KHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IG9mKHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIGlmICghaXNPYnNlcnZhYmxlKHJlc3VsdCkgJiYgaXNBc3luY0l0ZXJhYmxlKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZyb21Bc3luY0l0ZXJhYmxlKHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZyb20ocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXN1bHQgPSB0aHJvd0Vycm9yKGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWFuYWdlIHNvbWUgc3RhdGUgYXV0b21hdGljYWxseS5cbiAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogMCwgdG90YWw6IDEgfSwgY29udGV4dCk7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChcbiAgICAgICAgICByZXN1bHRcbiAgICAgICAgICAgIC5waXBlKFxuICAgICAgICAgICAgICBkZWZhdWx0SWZFbXB0eSh7IHN1Y2Nlc3M6IGZhbHNlIH0gYXMgdW5rbm93biksXG4gICAgICAgICAgICAgIHRhcCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZCB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIG1lcmdlTWFwKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEFsbG93IHRoZSBsb2cgcXVldWUgdG8gZmx1c2hcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihzZXRJbW1lZGlhdGUpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC5zdWJzY3JpYmUoXG4gICAgICAgICAgICAgIChtZXNzYWdlKSA9PiBvYnNlcnZlci5uZXh0KG1lc3NhZ2UgYXMgT3V0VCksXG4gICAgICAgICAgICAgIChlcnJvcikgPT4gb2JzZXJ2ZXIuZXJyb3IoZXJyb3IpLFxuICAgICAgICAgICAgICAoKSA9PiBvYnNlcnZlci5jb21wbGV0ZSgpLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgc3Vic2NyaXB0aW9ucy5mb3JFYWNoKCh4KSA9PiB4LnVuc3Vic2NyaWJlKCkpO1xuICAgICAgICBpbnB1dFN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBoYW5kbGVyLFxuICAgIFtCdWlsZGVyU3ltYm9sXTogdHJ1ZSxcbiAgICBbQnVpbGRlclZlcnNpb25TeW1ib2xdOiByZXF1aXJlKCcuLi9wYWNrYWdlLmpzb24nKS52ZXJzaW9uLFxuICB9O1xufVxuXG5mdW5jdGlvbiBpc0FzeW5jSXRlcmFibGU8VD4ob2JqOiB1bmtub3duKTogb2JqIGlzIEFzeW5jSXRlcmFibGU8VD4ge1xuICByZXR1cm4gISFvYmogJiYgdHlwZW9mIChvYmogYXMgQXN5bmNJdGVyYWJsZTxUPilbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID09PSAnZnVuY3Rpb24nO1xufVxuIl19