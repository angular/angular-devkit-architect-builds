"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
const core_1 = require("@angular-devkit/core");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const api_1 = require("./api");
const internal_1 = require("./internal");
const schedule_by_name_1 = require("./schedule-by-name");
function createBuilder(fn) {
    const cjh = core_1.experimental.jobs.createJobHandler;
    const handler = cjh((options, context) => {
        const scheduler = context.scheduler;
        const progressChannel = context.createChannel('progress');
        const logChannel = context.createChannel('log');
        let currentState = api_1.BuilderProgressState.Stopped;
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
            progressChannel.next(Object.assign({}, progress, (context.target && { target: context.target }), (context.builder && { builder: context.builder }), { id: context.id }));
        }
        return new rxjs_1.Observable(observer => {
            const subscriptions = [];
            const inputSubscription = context.inboundBus.subscribe(i => {
                switch (i.kind) {
                    case core_1.experimental.jobs.JobInboundMessageKind.Stop:
                        observer.complete();
                        break;
                    case core_1.experimental.jobs.JobInboundMessageKind.Input:
                        onInput(i.value);
                        break;
                }
            });
            function onInput(i) {
                const builder = i.info;
                const loggerName = i.target
                    ? api_1.targetStringFromTarget(i.target)
                    : builder.builderName;
                const logger = new core_1.logging.Logger(loggerName);
                subscriptions.push(logger.subscribe(entry => log(entry)));
                const context = {
                    builder,
                    workspaceRoot: i.workspaceRoot,
                    currentDirectory: i.currentDirectory,
                    target: i.target,
                    logger: logger,
                    id: i.id,
                    async scheduleTarget(target, overrides = {}) {
                        const run = await schedule_by_name_1.scheduleByTarget(target, overrides, {
                            scheduler,
                            logger: logger.createChild(''),
                            workspaceRoot: i.workspaceRoot,
                            currentDirectory: i.currentDirectory,
                        });
                        // We don't want to subscribe errors and complete.
                        subscriptions.push(run.progress.subscribe(event => progressChannel.next(event)));
                        return run;
                    },
                    async scheduleBuilder(builderName, options = {}) {
                        const run = await schedule_by_name_1.scheduleByName(builderName, options, {
                            scheduler,
                            logger: logger.createChild(''),
                            workspaceRoot: i.workspaceRoot,
                            currentDirectory: i.currentDirectory,
                        });
                        // We don't want to subscribe errors and complete.
                        subscriptions.push(run.progress.subscribe(event => progressChannel.next(event)));
                        return run;
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
                };
                context.reportRunning();
                let result = fn(i.options, context);
                if (core_1.isPromise(result)) {
                    result = rxjs_1.from(result);
                }
                else if (!rxjs_1.isObservable(result)) {
                    result = rxjs_1.of(result);
                }
                // Manage some state automatically.
                progress({ state: api_1.BuilderProgressState.Running, current: 0, total: 1 }, context);
                subscriptions.push(result.pipe(operators_1.tap(() => {
                    progress({ state: api_1.BuilderProgressState.Running, current: total }, context);
                    progress({ state: api_1.BuilderProgressState.Stopped }, context);
                })).subscribe(message => observer.next(message), error => observer.error(error), () => observer.complete()));
            }
            return () => {
                subscriptions.forEach(x => x.unsubscribe());
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvY3JlYXRlLWJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCwrQ0FBOEU7QUFDOUUsK0JBQXdFO0FBQ3hFLDhDQUFxQztBQUNyQywrQkFVZTtBQUNmLHlDQUEwRTtBQUMxRSx5REFBc0U7QUFHdEUsU0FBZ0IsYUFBYSxDQUMzQixFQUEwQjtJQUUxQixNQUFNLEdBQUcsR0FBRyxtQkFBWSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQStDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFO1FBQ3JGLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDcEMsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELElBQUksWUFBWSxHQUF5QiwwQkFBb0IsQ0FBQyxPQUFPLENBQUM7UUFDdEUsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZCxTQUFTLEdBQUcsQ0FBQyxLQUF1QjtZQUNsQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxTQUFTLFFBQVEsQ0FBQyxRQUE4QixFQUFFLE9BQXVCO1lBQ3ZFLFlBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQzlCLElBQUksUUFBUSxDQUFDLEtBQUssS0FBSywwQkFBb0IsQ0FBQyxPQUFPLEVBQUU7Z0JBQ25ELE9BQU8sR0FBRyxR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QW9CLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQzdELENBQUMsQ0FBQyxDQUNILENBQUMsU0FBUyxDQUNULE9BQU8sQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFDakMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUM5QixHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQzFCLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxPQUFPLEdBQUcsRUFBRTtnQkFDVixhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0wsT0FBTztRQUNQLENBQUMsd0JBQWEsQ0FBQyxFQUFFLElBQUk7UUFDckIsQ0FBQywrQkFBb0IsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE9BQU87S0FDM0QsQ0FBQztBQUNKLENBQUM7QUE1SkQsc0NBNEpDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuaW1wb3J0IHsgZXhwZXJpbWVudGFsLCBpc1Byb21pc2UsIGpzb24sIGxvZ2dpbmcgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlLCBTdWJzY3JpcHRpb24sIGZyb20sIGlzT2JzZXJ2YWJsZSwgb2YgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7IHRhcCB9IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcbmltcG9ydCB7XG4gIEJ1aWxkZXJDb250ZXh0LFxuICBCdWlsZGVySGFuZGxlckZuLFxuICBCdWlsZGVySW5mbyxcbiAgQnVpbGRlcklucHV0LFxuICBCdWlsZGVyT3V0cHV0LFxuICBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZSxcbiAgVGFyZ2V0LFxuICBUeXBlZEJ1aWxkZXJQcm9ncmVzcyxcbiAgdGFyZ2V0U3RyaW5nRnJvbVRhcmdldCxcbn0gZnJvbSAnLi9hcGknO1xuaW1wb3J0IHsgQnVpbGRlciwgQnVpbGRlclN5bWJvbCwgQnVpbGRlclZlcnNpb25TeW1ib2wgfSBmcm9tICcuL2ludGVybmFsJztcbmltcG9ydCB7IHNjaGVkdWxlQnlOYW1lLCBzY2hlZHVsZUJ5VGFyZ2V0IH0gZnJvbSAnLi9zY2hlZHVsZS1ieS1uYW1lJztcblxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQnVpbGRlcjxPcHRUIGV4dGVuZHMganNvbi5Kc29uT2JqZWN0PihcbiAgZm46IEJ1aWxkZXJIYW5kbGVyRm48T3B0VD4sXG4pOiBCdWlsZGVyPE9wdFQ+IHtcbiAgY29uc3QgY2poID0gZXhwZXJpbWVudGFsLmpvYnMuY3JlYXRlSm9iSGFuZGxlcjtcbiAgY29uc3QgaGFuZGxlciA9IGNqaDxqc29uLkpzb25PYmplY3QsIEJ1aWxkZXJJbnB1dCwgQnVpbGRlck91dHB1dD4oKG9wdGlvbnMsIGNvbnRleHQpID0+IHtcbiAgICBjb25zdCBzY2hlZHVsZXIgPSBjb250ZXh0LnNjaGVkdWxlcjtcbiAgICBjb25zdCBwcm9ncmVzc0NoYW5uZWwgPSBjb250ZXh0LmNyZWF0ZUNoYW5uZWwoJ3Byb2dyZXNzJyk7XG4gICAgY29uc3QgbG9nQ2hhbm5lbCA9IGNvbnRleHQuY3JlYXRlQ2hhbm5lbCgnbG9nJyk7XG4gICAgbGV0IGN1cnJlbnRTdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUgPSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5TdG9wcGVkO1xuICAgIGxldCBjdXJyZW50ID0gMDtcbiAgICBsZXQgc3RhdHVzID0gJyc7XG4gICAgbGV0IHRvdGFsID0gMTtcblxuICAgIGZ1bmN0aW9uIGxvZyhlbnRyeTogbG9nZ2luZy5Mb2dFbnRyeSkge1xuICAgICAgbG9nQ2hhbm5lbC5uZXh0KGVudHJ5KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcHJvZ3Jlc3MocHJvZ3Jlc3M6IFR5cGVkQnVpbGRlclByb2dyZXNzLCBjb250ZXh0OiBCdWlsZGVyQ29udGV4dCkge1xuICAgICAgY3VycmVudFN0YXRlID0gcHJvZ3Jlc3Muc3RhdGU7XG4gICAgICBpZiAocHJvZ3Jlc3Muc3RhdGUgPT09IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcpIHtcbiAgICAgICAgY3VycmVudCA9IHByb2dyZXNzLmN1cnJlbnQ7XG4gICAgICAgIHRvdGFsID0gcHJvZ3Jlc3MudG90YWwgIT09IHVuZGVmaW5lZCA/IHByb2dyZXNzLnRvdGFsIDogdG90YWw7XG5cbiAgICAgICAgaWYgKHByb2dyZXNzLnN0YXR1cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcHJvZ3Jlc3Muc3RhdHVzID0gc3RhdHVzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXR1cyA9IHByb2dyZXNzLnN0YXR1cztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwcm9ncmVzc0NoYW5uZWwubmV4dCh7XG4gICAgICAgIC4uLnByb2dyZXNzIGFzIGpzb24uSnNvbk9iamVjdCxcbiAgICAgICAgLi4uKGNvbnRleHQudGFyZ2V0ICYmIHsgdGFyZ2V0OiBjb250ZXh0LnRhcmdldCB9KSxcbiAgICAgICAgLi4uKGNvbnRleHQuYnVpbGRlciAmJiB7IGJ1aWxkZXI6IGNvbnRleHQuYnVpbGRlciB9KSxcbiAgICAgICAgaWQ6IGNvbnRleHQuaWQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGU8QnVpbGRlck91dHB1dD4ob2JzZXJ2ZXIgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uczogU3Vic2NyaXB0aW9uW10gPSBbXTtcblxuICAgICAgY29uc3QgaW5wdXRTdWJzY3JpcHRpb24gPSBjb250ZXh0LmluYm91bmRCdXMuc3Vic2NyaWJlKFxuICAgICAgICBpID0+IHtcbiAgICAgICAgICBzd2l0Y2ggKGkua2luZCkge1xuICAgICAgICAgICAgY2FzZSBleHBlcmltZW50YWwuam9icy5Kb2JJbmJvdW5kTWVzc2FnZUtpbmQuU3RvcDpcbiAgICAgICAgICAgICAgb2JzZXJ2ZXIuY29tcGxldGUoKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGV4cGVyaW1lbnRhbC5qb2JzLkpvYkluYm91bmRNZXNzYWdlS2luZC5JbnB1dDpcbiAgICAgICAgICAgICAgb25JbnB1dChpLnZhbHVlKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgKTtcblxuICAgICAgZnVuY3Rpb24gb25JbnB1dChpOiBCdWlsZGVySW5wdXQpIHtcbiAgICAgICAgY29uc3QgYnVpbGRlciA9IGkuaW5mbyBhcyBCdWlsZGVySW5mbztcbiAgICAgICAgY29uc3QgbG9nZ2VyTmFtZSA9IGkudGFyZ2V0XG4gICAgICAgICAgPyB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KGkudGFyZ2V0IGFzIFRhcmdldClcbiAgICAgICAgICA6IGJ1aWxkZXIuYnVpbGRlck5hbWU7XG4gICAgICAgIGNvbnN0IGxvZ2dlciA9IG5ldyBsb2dnaW5nLkxvZ2dlcihsb2dnZXJOYW1lKTtcblxuICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gobG9nZ2VyLnN1YnNjcmliZShlbnRyeSA9PiBsb2coZW50cnkpKSk7XG5cbiAgICAgICAgY29uc3QgY29udGV4dDogQnVpbGRlckNvbnRleHQgPSB7XG4gICAgICAgICAgYnVpbGRlcixcbiAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgY3VycmVudERpcmVjdG9yeTogaS5jdXJyZW50RGlyZWN0b3J5LFxuICAgICAgICAgIHRhcmdldDogaS50YXJnZXQgYXMgVGFyZ2V0LFxuICAgICAgICAgIGxvZ2dlcjogbG9nZ2VyLFxuICAgICAgICAgIGlkOiBpLmlkLFxuICAgICAgICAgIGFzeW5jIHNjaGVkdWxlVGFyZ2V0KHRhcmdldDogVGFyZ2V0LCBvdmVycmlkZXM6IGpzb24uSnNvbk9iamVjdCA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBydW4gPSBhd2FpdCBzY2hlZHVsZUJ5VGFyZ2V0KHRhcmdldCwgb3ZlcnJpZGVzLCB7XG4gICAgICAgICAgICAgIHNjaGVkdWxlcixcbiAgICAgICAgICAgICAgbG9nZ2VyOiBsb2dnZXIuY3JlYXRlQ2hpbGQoJycpLFxuICAgICAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN1YnNjcmliZSBlcnJvcnMgYW5kIGNvbXBsZXRlLlxuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKHJ1bi5wcm9ncmVzcy5zdWJzY3JpYmUoZXZlbnQgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBzY2hlZHVsZUJ1aWxkZXIoYnVpbGRlck5hbWU6IHN0cmluZywgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0ID0ge30pIHtcbiAgICAgICAgICAgIGNvbnN0IHJ1biA9IGF3YWl0IHNjaGVkdWxlQnlOYW1lKGJ1aWxkZXJOYW1lLCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgIHNjaGVkdWxlcixcbiAgICAgICAgICAgICAgbG9nZ2VyOiBsb2dnZXIuY3JlYXRlQ2hpbGQoJycpLFxuICAgICAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN1YnNjcmliZSBlcnJvcnMgYW5kIGNvbXBsZXRlLlxuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKHJ1bi5wcm9ncmVzcy5zdWJzY3JpYmUoZXZlbnQgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRSdW5uaW5nKCkge1xuICAgICAgICAgICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5XYWl0aW5nOlxuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlN0b3BwZWQ6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3Moe3N0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nLCBjdXJyZW50OiAwLCB0b3RhbH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVwb3J0U3RhdHVzKHN0YXR1czogc3RyaW5nKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBzdGF0dXMsIGN1cnJlbnQsIHRvdGFsIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLldhaXRpbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBzdGF0dXMgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRQcm9ncmVzcyhjdXJyZW50OiBudW1iZXIsIHRvdGFsPzogbnVtYmVyLCBzdGF0dXM/OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIGN1cnJlbnQsIHRvdGFsLCBzdGF0dXMgfSwgY29udGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBjb250ZXh0LnJlcG9ydFJ1bm5pbmcoKTtcbiAgICAgICAgbGV0IHJlc3VsdCA9IGZuKGkub3B0aW9ucyBhcyBPcHRULCBjb250ZXh0KTtcblxuICAgICAgICBpZiAoaXNQcm9taXNlKHJlc3VsdCkpIHtcbiAgICAgICAgICByZXN1bHQgPSBmcm9tKHJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIWlzT2JzZXJ2YWJsZShyZXN1bHQpKSB7XG4gICAgICAgICAgcmVzdWx0ID0gb2YocmVzdWx0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1hbmFnZSBzb21lIHN0YXRlIGF1dG9tYXRpY2FsbHkuXG4gICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcsIGN1cnJlbnQ6IDAsIHRvdGFsOiAxIH0sIGNvbnRleHQpO1xuICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gocmVzdWx0LnBpcGUoXG4gICAgICAgICAgdGFwKCgpID0+IHtcbiAgICAgICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcsIGN1cnJlbnQ6IHRvdGFsIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZCB9LCBjb250ZXh0KTtcbiAgICAgICAgICB9KSxcbiAgICAgICAgKS5zdWJzY3JpYmUoXG4gICAgICAgICAgbWVzc2FnZSA9PiBvYnNlcnZlci5uZXh0KG1lc3NhZ2UpLFxuICAgICAgICAgIGVycm9yID0+IG9ic2VydmVyLmVycm9yKGVycm9yKSxcbiAgICAgICAgICAoKSA9PiBvYnNlcnZlci5jb21wbGV0ZSgpLFxuICAgICAgICApKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgc3Vic2NyaXB0aW9ucy5mb3JFYWNoKHggPT4geC51bnN1YnNjcmliZSgpKTtcbiAgICAgICAgaW5wdXRTdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgaGFuZGxlcixcbiAgICBbQnVpbGRlclN5bWJvbF06IHRydWUsXG4gICAgW0J1aWxkZXJWZXJzaW9uU3ltYm9sXTogcmVxdWlyZSgnLi4vcGFja2FnZS5qc29uJykudmVyc2lvbixcbiAgfTtcbn1cbiJdfQ==