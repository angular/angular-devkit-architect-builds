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
                let result;
                try {
                    result = fn(i.options, context);
                }
                catch (e) {
                    result = rxjs_1.throwError(e);
                }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvY3JlYXRlLWJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCwrQ0FBOEU7QUFDOUUsK0JBQW9GO0FBQ3BGLDhDQUFxQztBQUNyQywrQkFXZTtBQUNmLHlDQUEwRTtBQUMxRSx5REFBc0U7QUFHdEUsU0FBZ0IsYUFBYSxDQUkzQixFQUEwQjtJQUUxQixNQUFNLEdBQUcsR0FBRyxtQkFBWSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQXNDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFO1FBQzVFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDcEMsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELElBQUksWUFBWSxHQUF5QiwwQkFBb0IsQ0FBQyxPQUFPLENBQUM7UUFDdEUsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZCxTQUFTLEdBQUcsQ0FBQyxLQUF1QjtZQUNsQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxTQUFTLFFBQVEsQ0FBQyxRQUE4QixFQUFFLE9BQXVCO1lBQ3ZFLFlBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQzlCLElBQUksUUFBUSxDQUFDLEtBQUssS0FBSywwQkFBb0IsQ0FBQyxPQUFPLEVBQUU7Z0JBQ25ELE9BQU8sR0FBRyxR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SyxFQUFFLDBCQUFvQixDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQzNFLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBb0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDN0QsQ0FBQyxDQUFDLENBQ0gsQ0FBQyxTQUFTLENBQ1QsT0FBTyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQWUsQ0FBQyxFQUN6QyxLQUFLLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQzlCLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FDMUIsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUVELE9BQU8sR0FBRyxFQUFFO2dCQUNWLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztnQkFDNUMsaUJBQWlCLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU87UUFDTCxPQUFPO1FBQ1AsQ0FBQyx3QkFBYSxDQUFDLEVBQUUsSUFBSTtRQUNyQixDQUFDLCtCQUFvQixDQUFDLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTztLQUMzRCxDQUFDO0FBQ0osQ0FBQztBQXBLRCxzQ0FvS0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgeyBleHBlcmltZW50YWwsIGlzUHJvbWlzZSwganNvbiwgbG9nZ2luZyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFN1YnNjcmlwdGlvbiwgZnJvbSwgaXNPYnNlcnZhYmxlLCBvZiwgdGhyb3dFcnJvciB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHsgdGFwIH0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgQnVpbGRlckNvbnRleHQsXG4gIEJ1aWxkZXJIYW5kbGVyRm4sXG4gIEJ1aWxkZXJJbmZvLFxuICBCdWlsZGVySW5wdXQsXG4gIEJ1aWxkZXJPdXRwdXQsXG4gIEJ1aWxkZXJPdXRwdXRMaWtlLFxuICBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZSxcbiAgVGFyZ2V0LFxuICBUeXBlZEJ1aWxkZXJQcm9ncmVzcyxcbiAgdGFyZ2V0U3RyaW5nRnJvbVRhcmdldCxcbn0gZnJvbSAnLi9hcGknO1xuaW1wb3J0IHsgQnVpbGRlciwgQnVpbGRlclN5bWJvbCwgQnVpbGRlclZlcnNpb25TeW1ib2wgfSBmcm9tICcuL2ludGVybmFsJztcbmltcG9ydCB7IHNjaGVkdWxlQnlOYW1lLCBzY2hlZHVsZUJ5VGFyZ2V0IH0gZnJvbSAnLi9zY2hlZHVsZS1ieS1uYW1lJztcblxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQnVpbGRlcjxcbiAgT3B0VCBleHRlbmRzIGpzb24uSnNvbk9iamVjdCxcbiAgT3V0VCBleHRlbmRzIEJ1aWxkZXJPdXRwdXQgPSBCdWlsZGVyT3V0cHV0LFxuPihcbiAgZm46IEJ1aWxkZXJIYW5kbGVyRm48T3B0VD4sXG4pOiBCdWlsZGVyPE9wdFQ+IHtcbiAgY29uc3QgY2poID0gZXhwZXJpbWVudGFsLmpvYnMuY3JlYXRlSm9iSGFuZGxlcjtcbiAgY29uc3QgaGFuZGxlciA9IGNqaDxqc29uLkpzb25PYmplY3QsIEJ1aWxkZXJJbnB1dCwgT3V0VD4oKG9wdGlvbnMsIGNvbnRleHQpID0+IHtcbiAgICBjb25zdCBzY2hlZHVsZXIgPSBjb250ZXh0LnNjaGVkdWxlcjtcbiAgICBjb25zdCBwcm9ncmVzc0NoYW5uZWwgPSBjb250ZXh0LmNyZWF0ZUNoYW5uZWwoJ3Byb2dyZXNzJyk7XG4gICAgY29uc3QgbG9nQ2hhbm5lbCA9IGNvbnRleHQuY3JlYXRlQ2hhbm5lbCgnbG9nJyk7XG4gICAgbGV0IGN1cnJlbnRTdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUgPSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5TdG9wcGVkO1xuICAgIGxldCBjdXJyZW50ID0gMDtcbiAgICBsZXQgc3RhdHVzID0gJyc7XG4gICAgbGV0IHRvdGFsID0gMTtcblxuICAgIGZ1bmN0aW9uIGxvZyhlbnRyeTogbG9nZ2luZy5Mb2dFbnRyeSkge1xuICAgICAgbG9nQ2hhbm5lbC5uZXh0KGVudHJ5KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcHJvZ3Jlc3MocHJvZ3Jlc3M6IFR5cGVkQnVpbGRlclByb2dyZXNzLCBjb250ZXh0OiBCdWlsZGVyQ29udGV4dCkge1xuICAgICAgY3VycmVudFN0YXRlID0gcHJvZ3Jlc3Muc3RhdGU7XG4gICAgICBpZiAocHJvZ3Jlc3Muc3RhdGUgPT09IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcpIHtcbiAgICAgICAgY3VycmVudCA9IHByb2dyZXNzLmN1cnJlbnQ7XG4gICAgICAgIHRvdGFsID0gcHJvZ3Jlc3MudG90YWwgIT09IHVuZGVmaW5lZCA/IHByb2dyZXNzLnRvdGFsIDogdG90YWw7XG5cbiAgICAgICAgaWYgKHByb2dyZXNzLnN0YXR1cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcHJvZ3Jlc3Muc3RhdHVzID0gc3RhdHVzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXR1cyA9IHByb2dyZXNzLnN0YXR1cztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwcm9ncmVzc0NoYW5uZWwubmV4dCh7XG4gICAgICAgIC4uLnByb2dyZXNzIGFzIGpzb24uSnNvbk9iamVjdCxcbiAgICAgICAgLi4uKGNvbnRleHQudGFyZ2V0ICYmIHsgdGFyZ2V0OiBjb250ZXh0LnRhcmdldCB9KSxcbiAgICAgICAgLi4uKGNvbnRleHQuYnVpbGRlciAmJiB7IGJ1aWxkZXI6IGNvbnRleHQuYnVpbGRlciB9KSxcbiAgICAgICAgaWQ6IGNvbnRleHQuaWQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGU8T3V0VD4ob2JzZXJ2ZXIgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uczogU3Vic2NyaXB0aW9uW10gPSBbXTtcblxuICAgICAgY29uc3QgaW5wdXRTdWJzY3JpcHRpb24gPSBjb250ZXh0LmluYm91bmRCdXMuc3Vic2NyaWJlKFxuICAgICAgICBpID0+IHtcbiAgICAgICAgICBzd2l0Y2ggKGkua2luZCkge1xuICAgICAgICAgICAgY2FzZSBleHBlcmltZW50YWwuam9icy5Kb2JJbmJvdW5kTWVzc2FnZUtpbmQuU3RvcDpcbiAgICAgICAgICAgICAgb2JzZXJ2ZXIuY29tcGxldGUoKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGV4cGVyaW1lbnRhbC5qb2JzLkpvYkluYm91bmRNZXNzYWdlS2luZC5JbnB1dDpcbiAgICAgICAgICAgICAgb25JbnB1dChpLnZhbHVlKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgKTtcblxuICAgICAgZnVuY3Rpb24gb25JbnB1dChpOiBCdWlsZGVySW5wdXQpIHtcbiAgICAgICAgY29uc3QgYnVpbGRlciA9IGkuaW5mbyBhcyBCdWlsZGVySW5mbztcbiAgICAgICAgY29uc3QgbG9nZ2VyTmFtZSA9IGkudGFyZ2V0XG4gICAgICAgICAgPyB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KGkudGFyZ2V0IGFzIFRhcmdldClcbiAgICAgICAgICA6IGJ1aWxkZXIuYnVpbGRlck5hbWU7XG4gICAgICAgIGNvbnN0IGxvZ2dlciA9IG5ldyBsb2dnaW5nLkxvZ2dlcihsb2dnZXJOYW1lKTtcblxuICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gobG9nZ2VyLnN1YnNjcmliZShlbnRyeSA9PiBsb2coZW50cnkpKSk7XG5cbiAgICAgICAgY29uc3QgY29udGV4dDogQnVpbGRlckNvbnRleHQgPSB7XG4gICAgICAgICAgYnVpbGRlcixcbiAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgY3VycmVudERpcmVjdG9yeTogaS5jdXJyZW50RGlyZWN0b3J5LFxuICAgICAgICAgIHRhcmdldDogaS50YXJnZXQgYXMgVGFyZ2V0LFxuICAgICAgICAgIGxvZ2dlcjogbG9nZ2VyLFxuICAgICAgICAgIGlkOiBpLmlkLFxuICAgICAgICAgIGFzeW5jIHNjaGVkdWxlVGFyZ2V0KHRhcmdldDogVGFyZ2V0LCBvdmVycmlkZXM6IGpzb24uSnNvbk9iamVjdCA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBydW4gPSBhd2FpdCBzY2hlZHVsZUJ5VGFyZ2V0KHRhcmdldCwgb3ZlcnJpZGVzLCB7XG4gICAgICAgICAgICAgIHNjaGVkdWxlcixcbiAgICAgICAgICAgICAgbG9nZ2VyOiBsb2dnZXIuY3JlYXRlQ2hpbGQoJycpLFxuICAgICAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN1YnNjcmliZSBlcnJvcnMgYW5kIGNvbXBsZXRlLlxuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKHJ1bi5wcm9ncmVzcy5zdWJzY3JpYmUoZXZlbnQgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBzY2hlZHVsZUJ1aWxkZXIoYnVpbGRlck5hbWU6IHN0cmluZywgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0ID0ge30pIHtcbiAgICAgICAgICAgIGNvbnN0IHJ1biA9IGF3YWl0IHNjaGVkdWxlQnlOYW1lKGJ1aWxkZXJOYW1lLCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgIHNjaGVkdWxlcixcbiAgICAgICAgICAgICAgbG9nZ2VyOiBsb2dnZXIuY3JlYXRlQ2hpbGQoJycpLFxuICAgICAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN1YnNjcmliZSBlcnJvcnMgYW5kIGNvbXBsZXRlLlxuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKHJ1bi5wcm9ncmVzcy5zdWJzY3JpYmUoZXZlbnQgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRSdW5uaW5nKCkge1xuICAgICAgICAgICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5XYWl0aW5nOlxuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlN0b3BwZWQ6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3Moe3N0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nLCBjdXJyZW50OiAwLCB0b3RhbH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVwb3J0U3RhdHVzKHN0YXR1czogc3RyaW5nKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBzdGF0dXMsIGN1cnJlbnQsIHRvdGFsIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLldhaXRpbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBzdGF0dXMgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRQcm9ncmVzcyhjdXJyZW50OiBudW1iZXIsIHRvdGFsPzogbnVtYmVyLCBzdGF0dXM/OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIGN1cnJlbnQsIHRvdGFsLCBzdGF0dXMgfSwgY29udGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBjb250ZXh0LnJlcG9ydFJ1bm5pbmcoKTtcbiAgICAgICAgbGV0IHJlc3VsdDogQnVpbGRlck91dHB1dExpa2U7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzdWx0ID0gZm4oaS5vcHRpb25zIGFzIE9wdFQsIGNvbnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gdGhyb3dFcnJvcihlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc1Byb21pc2UocmVzdWx0KSkge1xuICAgICAgICAgIHJlc3VsdCA9IGZyb20ocmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIGlmICghaXNPYnNlcnZhYmxlKHJlc3VsdCkpIHtcbiAgICAgICAgICByZXN1bHQgPSBvZihyZXN1bHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWFuYWdlIHNvbWUgc3RhdGUgYXV0b21hdGljYWxseS5cbiAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogMCwgdG90YWw6IDEgfSwgY29udGV4dCk7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChyZXN1bHQucGlwZShcbiAgICAgICAgICB0YXAoKCkgPT4ge1xuICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5TdG9wcGVkIH0sIGNvbnRleHQpO1xuICAgICAgICAgIH0pLFxuICAgICAgICApLnN1YnNjcmliZShcbiAgICAgICAgICBtZXNzYWdlID0+IG9ic2VydmVyLm5leHQobWVzc2FnZSBhcyBPdXRUKSxcbiAgICAgICAgICBlcnJvciA9PiBvYnNlcnZlci5lcnJvcihlcnJvciksXG4gICAgICAgICAgKCkgPT4gb2JzZXJ2ZXIuY29tcGxldGUoKSxcbiAgICAgICAgKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMuZm9yRWFjaCh4ID0+IHgudW5zdWJzY3JpYmUoKSk7XG4gICAgICAgIGlucHV0U3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGhhbmRsZXIsXG4gICAgW0J1aWxkZXJTeW1ib2xdOiB0cnVlLFxuICAgIFtCdWlsZGVyVmVyc2lvblN5bWJvbF06IHJlcXVpcmUoJy4uL3BhY2thZ2UuanNvbicpLnZlcnNpb24sXG4gIH07XG59XG4iXX0=