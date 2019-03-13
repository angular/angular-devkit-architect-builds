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
            progressChannel.next(Object.assign({}, progress, (context.target && { target: context.target }), (context.builder && { builder: context.builder }), { id: context.id }));
        }
        return new rxjs_1.Observable(observer => {
            const subscriptions = [];
            const inputSubscription = context.inboundBus.subscribe(i => {
                switch (i.kind) {
                    case core_1.experimental.jobs.JobInboundMessageKind.Stop:
                        // Run teardown logic then complete.
                        tearingDown = true;
                        Promise.all(teardownLogics.map(fn => fn() || Promise.resolve()))
                            .then(() => observer.complete(), err => observer.error(err));
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
                    async scheduleTarget(target, overrides = {}, scheduleOptions = {}) {
                        const run = await schedule_by_name_1.scheduleByTarget(target, overrides, {
                            scheduler,
                            logger: scheduleOptions.logger || logger.createChild(''),
                            workspaceRoot: i.workspaceRoot,
                            currentDirectory: i.currentDirectory,
                        });
                        // We don't want to subscribe errors and complete.
                        subscriptions.push(run.progress.subscribe(event => progressChannel.next(event)));
                        return run;
                    },
                    async scheduleBuilder(builderName, options = {}, scheduleOptions = {}) {
                        const run = await schedule_by_name_1.scheduleByName(builderName, options, {
                            scheduler,
                            logger: scheduleOptions.logger || logger.createChild(''),
                            workspaceRoot: i.workspaceRoot,
                            currentDirectory: i.currentDirectory,
                        });
                        // We don't want to subscribe errors and complete.
                        subscriptions.push(run.progress.subscribe(event => progressChannel.next(event)));
                        return run;
                    },
                    async getTargetOptions(target) {
                        return scheduler.schedule('..getTargetOptions', target).output.toPromise();
                    },
                    async getBuilderNameForTarget(target) {
                        return scheduler.schedule('..getBuilderNameForTarget', target).output.toPromise();
                    },
                    async validateOptions(options, builderName) {
                        return scheduler.schedule('..validateOptions', [builderName, options]).output.toPromise();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvY3JlYXRlLWJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCwrQ0FBOEU7QUFDOUUsK0JBQW9GO0FBQ3BGLDhDQUFxQztBQUNyQywrQkFZZTtBQUNmLHlDQUEwRTtBQUMxRSx5REFBc0U7QUFHdEUsU0FBZ0IsYUFBYSxDQUkzQixFQUEwQjtJQUUxQixNQUFNLEdBQUcsR0FBRyxtQkFBWSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQXNDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFO1FBQzVFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDcEMsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELElBQUksWUFBWSxHQUF5QiwwQkFBb0IsQ0FBQyxPQUFPLENBQUM7UUFDdEUsTUFBTSxjQUFjLEdBQTRDLEVBQUUsQ0FBQztRQUNuRSxJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDeEIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZCxTQUFTLEdBQUcsQ0FBQyxLQUF1QjtZQUNsQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxTQUFTLFFBQVEsQ0FBQyxRQUE4QixFQUFFLE9BQXVCO1lBQ3ZFLFlBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQzlCLElB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LENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQW9CLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDM0UsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUFvQixDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM3RCxDQUFDLENBQUMsQ0FDSCxDQUFDLFNBQVMsQ0FDVCxPQUFPLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBZSxDQUFDLEVBQ3pDLEtBQUssQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFDOUIsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUMxQixDQUFDLENBQUM7WUFDTCxDQUFDO1lBRUQsT0FBTyxHQUFHLEVBQUU7Z0JBQ1YsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNsQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTztRQUNMLE9BQU87UUFDUCxDQUFDLHdCQUFhLENBQUMsRUFBRSxJQUFJO1FBQ3JCLENBQUMsK0JBQW9CLENBQUMsRUFBRSxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxPQUFPO0tBQzNELENBQUM7QUFDSixDQUFDO0FBek1ELHNDQXlNQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cbmltcG9ydCB7IGV4cGVyaW1lbnRhbCwgaXNQcm9taXNlLCBqc29uLCBsb2dnaW5nIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgU3Vic2NyaXB0aW9uLCBmcm9tLCBpc09ic2VydmFibGUsIG9mLCB0aHJvd0Vycm9yIH0gZnJvbSAncnhqcyc7XG5pbXBvcnQgeyB0YXAgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQge1xuICBCdWlsZGVyQ29udGV4dCxcbiAgQnVpbGRlckhhbmRsZXJGbixcbiAgQnVpbGRlckluZm8sXG4gIEJ1aWxkZXJJbnB1dCxcbiAgQnVpbGRlck91dHB1dCxcbiAgQnVpbGRlck91dHB1dExpa2UsXG4gIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLFxuICBTY2hlZHVsZU9wdGlvbnMsXG4gIFRhcmdldCxcbiAgVHlwZWRCdWlsZGVyUHJvZ3Jlc3MsXG4gIHRhcmdldFN0cmluZ0Zyb21UYXJnZXQsXG59IGZyb20gJy4vYXBpJztcbmltcG9ydCB7IEJ1aWxkZXIsIEJ1aWxkZXJTeW1ib2wsIEJ1aWxkZXJWZXJzaW9uU3ltYm9sIH0gZnJvbSAnLi9pbnRlcm5hbCc7XG5pbXBvcnQgeyBzY2hlZHVsZUJ5TmFtZSwgc2NoZWR1bGVCeVRhcmdldCB9IGZyb20gJy4vc2NoZWR1bGUtYnktbmFtZSc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJ1aWxkZXI8XG4gIE9wdFQgZXh0ZW5kcyBqc29uLkpzb25PYmplY3QsXG4gIE91dFQgZXh0ZW5kcyBCdWlsZGVyT3V0cHV0ID0gQnVpbGRlck91dHB1dCxcbj4oXG4gIGZuOiBCdWlsZGVySGFuZGxlckZuPE9wdFQ+LFxuKTogQnVpbGRlcjxPcHRUPiB7XG4gIGNvbnN0IGNqaCA9IGV4cGVyaW1lbnRhbC5qb2JzLmNyZWF0ZUpvYkhhbmRsZXI7XG4gIGNvbnN0IGhhbmRsZXIgPSBjamg8anNvbi5Kc29uT2JqZWN0LCBCdWlsZGVySW5wdXQsIE91dFQ+KChvcHRpb25zLCBjb250ZXh0KSA9PiB7XG4gICAgY29uc3Qgc2NoZWR1bGVyID0gY29udGV4dC5zY2hlZHVsZXI7XG4gICAgY29uc3QgcHJvZ3Jlc3NDaGFubmVsID0gY29udGV4dC5jcmVhdGVDaGFubmVsKCdwcm9ncmVzcycpO1xuICAgIGNvbnN0IGxvZ0NoYW5uZWwgPSBjb250ZXh0LmNyZWF0ZUNoYW5uZWwoJ2xvZycpO1xuICAgIGxldCBjdXJyZW50U3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlID0gQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZDtcbiAgICBjb25zdCB0ZWFyZG93bkxvZ2ljczogQXJyYXk8KCkgPT4gKFByb21pc2VMaWtlPHZvaWQ+IHwgdm9pZCk+ID0gW107XG4gICAgbGV0IHRlYXJpbmdEb3duID0gZmFsc2U7XG4gICAgbGV0IGN1cnJlbnQgPSAwO1xuICAgIGxldCBzdGF0dXMgPSAnJztcbiAgICBsZXQgdG90YWwgPSAxO1xuXG4gICAgZnVuY3Rpb24gbG9nKGVudHJ5OiBsb2dnaW5nLkxvZ0VudHJ5KSB7XG4gICAgICBsb2dDaGFubmVsLm5leHQoZW50cnkpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwcm9ncmVzcyhwcm9ncmVzczogVHlwZWRCdWlsZGVyUHJvZ3Jlc3MsIGNvbnRleHQ6IEJ1aWxkZXJDb250ZXh0KSB7XG4gICAgICBjdXJyZW50U3RhdGUgPSBwcm9ncmVzcy5zdGF0ZTtcbiAgICAgIGlmIChwcm9ncmVzcy5zdGF0ZSA9PT0gQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZykge1xuICAgICAgICBjdXJyZW50ID0gcHJvZ3Jlc3MuY3VycmVudDtcbiAgICAgICAgdG90YWwgPSBwcm9ncmVzcy50b3RhbCAhPT0gdW5kZWZpbmVkID8gcHJvZ3Jlc3MudG90YWwgOiB0b3RhbDtcblxuICAgICAgICBpZiAocHJvZ3Jlc3Muc3RhdHVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwcm9ncmVzcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdHVzID0gcHJvZ3Jlc3Muc3RhdHVzO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHByb2dyZXNzQ2hhbm5lbC5uZXh0KHtcbiAgICAgICAgLi4ucHJvZ3Jlc3MgYXMganNvbi5Kc29uT2JqZWN0LFxuICAgICAgICAuLi4oY29udGV4dC50YXJnZXQgJiYgeyB0YXJnZXQ6IGNvbnRleHQudGFyZ2V0IH0pLFxuICAgICAgICAuLi4oY29udGV4dC5idWlsZGVyICYmIHsgYnVpbGRlcjogY29udGV4dC5idWlsZGVyIH0pLFxuICAgICAgICBpZDogY29udGV4dC5pZCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgT2JzZXJ2YWJsZTxPdXRUPihvYnNlcnZlciA9PiB7XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25zOiBTdWJzY3JpcHRpb25bXSA9IFtdO1xuXG4gICAgICBjb25zdCBpbnB1dFN1YnNjcmlwdGlvbiA9IGNvbnRleHQuaW5ib3VuZEJ1cy5zdWJzY3JpYmUoXG4gICAgICAgIGkgPT4ge1xuICAgICAgICAgIHN3aXRjaCAoaS5raW5kKSB7XG4gICAgICAgICAgICBjYXNlIGV4cGVyaW1lbnRhbC5qb2JzLkpvYkluYm91bmRNZXNzYWdlS2luZC5TdG9wOlxuICAgICAgICAgICAgICAvLyBSdW4gdGVhcmRvd24gbG9naWMgdGhlbiBjb21wbGV0ZS5cbiAgICAgICAgICAgICAgdGVhcmluZ0Rvd24gPSB0cnVlO1xuICAgICAgICAgICAgICBQcm9taXNlLmFsbCh0ZWFyZG93bkxvZ2ljcy5tYXAoZm4gPT4gZm4oKSB8fCBQcm9taXNlLnJlc29sdmUoKSkpXG4gICAgICAgICAgICAgICAgLnRoZW4oKCkgPT4gb2JzZXJ2ZXIuY29tcGxldGUoKSwgZXJyID0+IG9ic2VydmVyLmVycm9yKGVycikpO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLklucHV0OlxuICAgICAgICAgICAgICBpZiAoIXRlYXJpbmdEb3duKSB7XG4gICAgICAgICAgICAgICAgb25JbnB1dChpLnZhbHVlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICApO1xuXG4gICAgICBmdW5jdGlvbiBvbklucHV0KGk6IEJ1aWxkZXJJbnB1dCkge1xuICAgICAgICBjb25zdCBidWlsZGVyID0gaS5pbmZvIGFzIEJ1aWxkZXJJbmZvO1xuICAgICAgICBjb25zdCBsb2dnZXJOYW1lID0gaS50YXJnZXRcbiAgICAgICAgICA/IHRhcmdldFN0cmluZ0Zyb21UYXJnZXQoaS50YXJnZXQgYXMgVGFyZ2V0KVxuICAgICAgICAgIDogYnVpbGRlci5idWlsZGVyTmFtZTtcbiAgICAgICAgY29uc3QgbG9nZ2VyID0gbmV3IGxvZ2dpbmcuTG9nZ2VyKGxvZ2dlck5hbWUpO1xuXG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChsb2dnZXIuc3Vic2NyaWJlKGVudHJ5ID0+IGxvZyhlbnRyeSkpKTtcblxuICAgICAgICBjb25zdCBjb250ZXh0OiBCdWlsZGVyQ29udGV4dCA9IHtcbiAgICAgICAgICBidWlsZGVyLFxuICAgICAgICAgIHdvcmtzcGFjZVJvb3Q6IGkud29ya3NwYWNlUm9vdCxcbiAgICAgICAgICBjdXJyZW50RGlyZWN0b3J5OiBpLmN1cnJlbnREaXJlY3RvcnksXG4gICAgICAgICAgdGFyZ2V0OiBpLnRhcmdldCBhcyBUYXJnZXQsXG4gICAgICAgICAgbG9nZ2VyOiBsb2dnZXIsXG4gICAgICAgICAgaWQ6IGkuaWQsXG4gICAgICAgICAgYXN5bmMgc2NoZWR1bGVUYXJnZXQoXG4gICAgICAgICAgICB0YXJnZXQ6IFRhcmdldCxcbiAgICAgICAgICAgIG92ZXJyaWRlczoganNvbi5Kc29uT2JqZWN0ID0ge30sXG4gICAgICAgICAgICBzY2hlZHVsZU9wdGlvbnM6IFNjaGVkdWxlT3B0aW9ucyA9IHt9LFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgY29uc3QgcnVuID0gYXdhaXQgc2NoZWR1bGVCeVRhcmdldCh0YXJnZXQsIG92ZXJyaWRlcywge1xuICAgICAgICAgICAgICBzY2hlZHVsZXIsXG4gICAgICAgICAgICAgIGxvZ2dlcjogc2NoZWR1bGVPcHRpb25zLmxvZ2dlciB8fCBsb2dnZXIuY3JlYXRlQ2hpbGQoJycpLFxuICAgICAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN1YnNjcmliZSBlcnJvcnMgYW5kIGNvbXBsZXRlLlxuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKHJ1bi5wcm9ncmVzcy5zdWJzY3JpYmUoZXZlbnQgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBzY2hlZHVsZUJ1aWxkZXIoXG4gICAgICAgICAgICBidWlsZGVyTmFtZTogc3RyaW5nLFxuICAgICAgICAgICAgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0ID0ge30sXG4gICAgICAgICAgICBzY2hlZHVsZU9wdGlvbnM6IFNjaGVkdWxlT3B0aW9ucyA9IHt9LFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgY29uc3QgcnVuID0gYXdhaXQgc2NoZWR1bGVCeU5hbWUoYnVpbGRlck5hbWUsIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgc2NoZWR1bGVyLFxuICAgICAgICAgICAgICBsb2dnZXI6IHNjaGVkdWxlT3B0aW9ucy5sb2dnZXIgfHwgbG9nZ2VyLmNyZWF0ZUNoaWxkKCcnKSxcbiAgICAgICAgICAgICAgd29ya3NwYWNlUm9vdDogaS53b3Jrc3BhY2VSb290LFxuICAgICAgICAgICAgICBjdXJyZW50RGlyZWN0b3J5OiBpLmN1cnJlbnREaXJlY3RvcnksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2UgZG9uJ3Qgd2FudCB0byBzdWJzY3JpYmUgZXJyb3JzIGFuZCBjb21wbGV0ZS5cbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChydW4ucHJvZ3Jlc3Muc3Vic2NyaWJlKGV2ZW50ID0+IHByb2dyZXNzQ2hhbm5lbC5uZXh0KGV2ZW50KSkpO1xuXG4gICAgICAgICAgICByZXR1cm4gcnVuO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgYXN5bmMgZ2V0VGFyZ2V0T3B0aW9ucyh0YXJnZXQ6IFRhcmdldCkge1xuICAgICAgICAgICAgcmV0dXJuIHNjaGVkdWxlci5zY2hlZHVsZTxUYXJnZXQsIGpzb24uSnNvblZhbHVlLCBqc29uLkpzb25PYmplY3Q+KFxuICAgICAgICAgICAgICAgICAgICAnLi5nZXRUYXJnZXRPcHRpb25zJywgdGFyZ2V0KS5vdXRwdXQudG9Qcm9taXNlKCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBnZXRCdWlsZGVyTmFtZUZvclRhcmdldCh0YXJnZXQ6IFRhcmdldCkge1xuICAgICAgICAgICAgcmV0dXJuIHNjaGVkdWxlci5zY2hlZHVsZTxUYXJnZXQsIGpzb24uSnNvblZhbHVlLCBzdHJpbmc+KFxuICAgICAgICAgICAgICAnLi5nZXRCdWlsZGVyTmFtZUZvclRhcmdldCcsXG4gICAgICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICAgICkub3V0cHV0LnRvUHJvbWlzZSgpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgYXN5bmMgdmFsaWRhdGVPcHRpb25zPFQgZXh0ZW5kcyBqc29uLkpzb25PYmplY3QgPSBqc29uLkpzb25PYmplY3Q+KFxuICAgICAgICAgICAgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0LFxuICAgICAgICAgICAgYnVpbGRlck5hbWU6IHN0cmluZyxcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBzY2hlZHVsZXIuc2NoZWR1bGU8W3N0cmluZywganNvbi5Kc29uT2JqZWN0XSwganNvbi5Kc29uVmFsdWUsIFQ+KFxuICAgICAgICAgICAgICAnLi52YWxpZGF0ZU9wdGlvbnMnLFxuICAgICAgICAgICAgICBbYnVpbGRlck5hbWUsIG9wdGlvbnNdLFxuICAgICAgICAgICAgKS5vdXRwdXQudG9Qcm9taXNlKCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRSdW5uaW5nKCkge1xuICAgICAgICAgICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5XYWl0aW5nOlxuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlN0b3BwZWQ6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogMCwgdG90YWwgIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVwb3J0U3RhdHVzKHN0YXR1czogc3RyaW5nKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBzdGF0dXMsIGN1cnJlbnQsIHRvdGFsICB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5XYWl0aW5nOlxuICAgICAgICAgICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IGN1cnJlbnRTdGF0ZSwgc3RhdHVzIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVwb3J0UHJvZ3Jlc3MoY3VycmVudDogbnVtYmVyLCB0b3RhbD86IG51bWJlciwgc3RhdHVzPzogc3RyaW5nKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBjdXJyZW50LCB0b3RhbCwgc3RhdHVzIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYWRkVGVhcmRvd24odGVhcmRvd246ICgpID0+IChQcm9taXNlPHZvaWQ+IHwgdm9pZCkpOiB2b2lkIHtcbiAgICAgICAgICAgIHRlYXJkb3duTG9naWNzLnB1c2godGVhcmRvd24pO1xuICAgICAgICAgIH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgY29udGV4dC5yZXBvcnRSdW5uaW5nKCk7XG4gICAgICAgIGxldCByZXN1bHQ6IEJ1aWxkZXJPdXRwdXRMaWtlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc3VsdCA9IGZuKGkub3B0aW9ucyBhcyBPcHRULCBjb250ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlc3VsdCA9IHRocm93RXJyb3IoZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNQcm9taXNlKHJlc3VsdCkpIHtcbiAgICAgICAgICByZXN1bHQgPSBmcm9tKHJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIWlzT2JzZXJ2YWJsZShyZXN1bHQpKSB7XG4gICAgICAgICAgcmVzdWx0ID0gb2YocmVzdWx0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1hbmFnZSBzb21lIHN0YXRlIGF1dG9tYXRpY2FsbHkuXG4gICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcsIGN1cnJlbnQ6IDAsIHRvdGFsOiAxIH0sIGNvbnRleHQpO1xuICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gocmVzdWx0LnBpcGUoXG4gICAgICAgICAgdGFwKCgpID0+IHtcbiAgICAgICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcsIGN1cnJlbnQ6IHRvdGFsIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZCB9LCBjb250ZXh0KTtcbiAgICAgICAgICB9KSxcbiAgICAgICAgKS5zdWJzY3JpYmUoXG4gICAgICAgICAgbWVzc2FnZSA9PiBvYnNlcnZlci5uZXh0KG1lc3NhZ2UgYXMgT3V0VCksXG4gICAgICAgICAgZXJyb3IgPT4gb2JzZXJ2ZXIuZXJyb3IoZXJyb3IpLFxuICAgICAgICAgICgpID0+IG9ic2VydmVyLmNvbXBsZXRlKCksXG4gICAgICAgICkpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICBzdWJzY3JpcHRpb25zLmZvckVhY2goeCA9PiB4LnVuc3Vic2NyaWJlKCkpO1xuICAgICAgICBpbnB1dFN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBoYW5kbGVyLFxuICAgIFtCdWlsZGVyU3ltYm9sXTogdHJ1ZSxcbiAgICBbQnVpbGRlclZlcnNpb25TeW1ib2xdOiByZXF1aXJlKCcuLi9wYWNrYWdlLmpzb24nKS52ZXJzaW9uLFxuICB9O1xufVxuIl19