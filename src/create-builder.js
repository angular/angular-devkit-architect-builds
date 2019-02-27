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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvY3JlYXRlLWJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCwrQ0FBOEU7QUFDOUUsK0JBQXdFO0FBQ3hFLDhDQUFxQztBQUNyQywrQkFVZTtBQUNmLHlDQUEwRTtBQUMxRSx5REFBc0U7QUFHdEUsU0FBZ0IsYUFBYSxDQUkzQixFQUEwQjtJQUUxQixNQUFNLEdBQUcsR0FBRyxtQkFBWSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQXNDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFO1FBQzVFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDcEMsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELElBQUksWUFBWSxHQUF5QiwwQkFBb0IsQ0FBQyxPQUFPLENBQUM7UUFDdEUsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZCxTQUFTLEdBQUcsQ0FBQyxLQUF1QjtZQUNsQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxTQUFTLFFBQVEsQ0FBQyxRQUE4QixFQUFFLE9BQXVCO1lBQ3ZFLFlBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQzlCLElBQUksUUFBUSxDQUFDLEtBQUssS0FBSywwQkFBb0IsQ0FBQyxPQUFPLEVBQUU7Z0JBQ25ELE9BQU8sR0FBRyxR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b0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDN0QsQ0FBQyxDQUFDLENBQ0gsQ0FBQyxTQUFTLENBQ1QsT0FBTyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQWUsQ0FBQyxFQUN6QyxLQUFLLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQzlCLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FDMUIsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUVELE9BQU8sR0FBRyxFQUFFO2dCQUNWLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztnQkFDNUMsaUJBQWlCLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU87UUFDTCxPQUFPO1FBQ1AsQ0FBQyx3QkFBYSxDQUFDLEVBQUUsSUFBSTtRQUNyQixDQUFDLCtCQUFvQixDQUFDLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTztLQUMzRCxDQUFDO0FBQ0osQ0FBQztBQS9KRCxzQ0ErSkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgeyBleHBlcmltZW50YWwsIGlzUHJvbWlzZSwganNvbiwgbG9nZ2luZyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFN1YnNjcmlwdGlvbiwgZnJvbSwgaXNPYnNlcnZhYmxlLCBvZiB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHsgdGFwIH0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgQnVpbGRlckNvbnRleHQsXG4gIEJ1aWxkZXJIYW5kbGVyRm4sXG4gIEJ1aWxkZXJJbmZvLFxuICBCdWlsZGVySW5wdXQsXG4gIEJ1aWxkZXJPdXRwdXQsXG4gIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLFxuICBUYXJnZXQsXG4gIFR5cGVkQnVpbGRlclByb2dyZXNzLFxuICB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0LFxufSBmcm9tICcuL2FwaSc7XG5pbXBvcnQgeyBCdWlsZGVyLCBCdWlsZGVyU3ltYm9sLCBCdWlsZGVyVmVyc2lvblN5bWJvbCB9IGZyb20gJy4vaW50ZXJuYWwnO1xuaW1wb3J0IHsgc2NoZWR1bGVCeU5hbWUsIHNjaGVkdWxlQnlUYXJnZXQgfSBmcm9tICcuL3NjaGVkdWxlLWJ5LW5hbWUnO1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVCdWlsZGVyPFxuICBPcHRUIGV4dGVuZHMganNvbi5Kc29uT2JqZWN0LFxuICBPdXRUIGV4dGVuZHMgQnVpbGRlck91dHB1dCA9IEJ1aWxkZXJPdXRwdXQsXG4+KFxuICBmbjogQnVpbGRlckhhbmRsZXJGbjxPcHRUPixcbik6IEJ1aWxkZXI8T3B0VD4ge1xuICBjb25zdCBjamggPSBleHBlcmltZW50YWwuam9icy5jcmVhdGVKb2JIYW5kbGVyO1xuICBjb25zdCBoYW5kbGVyID0gY2poPGpzb24uSnNvbk9iamVjdCwgQnVpbGRlcklucHV0LCBPdXRUPigob3B0aW9ucywgY29udGV4dCkgPT4ge1xuICAgIGNvbnN0IHNjaGVkdWxlciA9IGNvbnRleHQuc2NoZWR1bGVyO1xuICAgIGNvbnN0IHByb2dyZXNzQ2hhbm5lbCA9IGNvbnRleHQuY3JlYXRlQ2hhbm5lbCgncHJvZ3Jlc3MnKTtcbiAgICBjb25zdCBsb2dDaGFubmVsID0gY29udGV4dC5jcmVhdGVDaGFubmVsKCdsb2cnKTtcbiAgICBsZXQgY3VycmVudFN0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZSA9IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlN0b3BwZWQ7XG4gICAgbGV0IGN1cnJlbnQgPSAwO1xuICAgIGxldCBzdGF0dXMgPSAnJztcbiAgICBsZXQgdG90YWwgPSAxO1xuXG4gICAgZnVuY3Rpb24gbG9nKGVudHJ5OiBsb2dnaW5nLkxvZ0VudHJ5KSB7XG4gICAgICBsb2dDaGFubmVsLm5leHQoZW50cnkpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwcm9ncmVzcyhwcm9ncmVzczogVHlwZWRCdWlsZGVyUHJvZ3Jlc3MsIGNvbnRleHQ6IEJ1aWxkZXJDb250ZXh0KSB7XG4gICAgICBjdXJyZW50U3RhdGUgPSBwcm9ncmVzcy5zdGF0ZTtcbiAgICAgIGlmIChwcm9ncmVzcy5zdGF0ZSA9PT0gQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZykge1xuICAgICAgICBjdXJyZW50ID0gcHJvZ3Jlc3MuY3VycmVudDtcbiAgICAgICAgdG90YWwgPSBwcm9ncmVzcy50b3RhbCAhPT0gdW5kZWZpbmVkID8gcHJvZ3Jlc3MudG90YWwgOiB0b3RhbDtcblxuICAgICAgICBpZiAocHJvZ3Jlc3Muc3RhdHVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwcm9ncmVzcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdHVzID0gcHJvZ3Jlc3Muc3RhdHVzO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHByb2dyZXNzQ2hhbm5lbC5uZXh0KHtcbiAgICAgICAgLi4ucHJvZ3Jlc3MgYXMganNvbi5Kc29uT2JqZWN0LFxuICAgICAgICAuLi4oY29udGV4dC50YXJnZXQgJiYgeyB0YXJnZXQ6IGNvbnRleHQudGFyZ2V0IH0pLFxuICAgICAgICAuLi4oY29udGV4dC5idWlsZGVyICYmIHsgYnVpbGRlcjogY29udGV4dC5idWlsZGVyIH0pLFxuICAgICAgICBpZDogY29udGV4dC5pZCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgT2JzZXJ2YWJsZTxPdXRUPihvYnNlcnZlciA9PiB7XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25zOiBTdWJzY3JpcHRpb25bXSA9IFtdO1xuXG4gICAgICBjb25zdCBpbnB1dFN1YnNjcmlwdGlvbiA9IGNvbnRleHQuaW5ib3VuZEJ1cy5zdWJzY3JpYmUoXG4gICAgICAgIGkgPT4ge1xuICAgICAgICAgIHN3aXRjaCAoaS5raW5kKSB7XG4gICAgICAgICAgICBjYXNlIGV4cGVyaW1lbnRhbC5qb2JzLkpvYkluYm91bmRNZXNzYWdlS2luZC5TdG9wOlxuICAgICAgICAgICAgICBvYnNlcnZlci5jb21wbGV0ZSgpO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLklucHV0OlxuICAgICAgICAgICAgICBvbklucHV0KGkudmFsdWUpO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICApO1xuXG4gICAgICBmdW5jdGlvbiBvbklucHV0KGk6IEJ1aWxkZXJJbnB1dCkge1xuICAgICAgICBjb25zdCBidWlsZGVyID0gaS5pbmZvIGFzIEJ1aWxkZXJJbmZvO1xuICAgICAgICBjb25zdCBsb2dnZXJOYW1lID0gaS50YXJnZXRcbiAgICAgICAgICA/IHRhcmdldFN0cmluZ0Zyb21UYXJnZXQoaS50YXJnZXQgYXMgVGFyZ2V0KVxuICAgICAgICAgIDogYnVpbGRlci5idWlsZGVyTmFtZTtcbiAgICAgICAgY29uc3QgbG9nZ2VyID0gbmV3IGxvZ2dpbmcuTG9nZ2VyKGxvZ2dlck5hbWUpO1xuXG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChsb2dnZXIuc3Vic2NyaWJlKGVudHJ5ID0+IGxvZyhlbnRyeSkpKTtcblxuICAgICAgICBjb25zdCBjb250ZXh0OiBCdWlsZGVyQ29udGV4dCA9IHtcbiAgICAgICAgICBidWlsZGVyLFxuICAgICAgICAgIHdvcmtzcGFjZVJvb3Q6IGkud29ya3NwYWNlUm9vdCxcbiAgICAgICAgICBjdXJyZW50RGlyZWN0b3J5OiBpLmN1cnJlbnREaXJlY3RvcnksXG4gICAgICAgICAgdGFyZ2V0OiBpLnRhcmdldCBhcyBUYXJnZXQsXG4gICAgICAgICAgbG9nZ2VyOiBsb2dnZXIsXG4gICAgICAgICAgaWQ6IGkuaWQsXG4gICAgICAgICAgYXN5bmMgc2NoZWR1bGVUYXJnZXQodGFyZ2V0OiBUYXJnZXQsIG92ZXJyaWRlczoganNvbi5Kc29uT2JqZWN0ID0ge30pIHtcbiAgICAgICAgICAgIGNvbnN0IHJ1biA9IGF3YWl0IHNjaGVkdWxlQnlUYXJnZXQodGFyZ2V0LCBvdmVycmlkZXMsIHtcbiAgICAgICAgICAgICAgc2NoZWR1bGVyLFxuICAgICAgICAgICAgICBsb2dnZXI6IGxvZ2dlci5jcmVhdGVDaGlsZCgnJyksXG4gICAgICAgICAgICAgIHdvcmtzcGFjZVJvb3Q6IGkud29ya3NwYWNlUm9vdCxcbiAgICAgICAgICAgICAgY3VycmVudERpcmVjdG9yeTogaS5jdXJyZW50RGlyZWN0b3J5LFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gc3Vic2NyaWJlIGVycm9ycyBhbmQgY29tcGxldGUuXG4gICAgICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gocnVuLnByb2dyZXNzLnN1YnNjcmliZShldmVudCA9PiBwcm9ncmVzc0NoYW5uZWwubmV4dChldmVudCkpKTtcblxuICAgICAgICAgICAgcmV0dXJuIHJ1bjtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFzeW5jIHNjaGVkdWxlQnVpbGRlcihidWlsZGVyTmFtZTogc3RyaW5nLCBvcHRpb25zOiBqc29uLkpzb25PYmplY3QgPSB7fSkge1xuICAgICAgICAgICAgY29uc3QgcnVuID0gYXdhaXQgc2NoZWR1bGVCeU5hbWUoYnVpbGRlck5hbWUsIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgc2NoZWR1bGVyLFxuICAgICAgICAgICAgICBsb2dnZXI6IGxvZ2dlci5jcmVhdGVDaGlsZCgnJyksXG4gICAgICAgICAgICAgIHdvcmtzcGFjZVJvb3Q6IGkud29ya3NwYWNlUm9vdCxcbiAgICAgICAgICAgICAgY3VycmVudERpcmVjdG9yeTogaS5jdXJyZW50RGlyZWN0b3J5LFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gc3Vic2NyaWJlIGVycm9ycyBhbmQgY29tcGxldGUuXG4gICAgICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gocnVuLnByb2dyZXNzLnN1YnNjcmliZShldmVudCA9PiBwcm9ncmVzc0NoYW5uZWwubmV4dChldmVudCkpKTtcblxuICAgICAgICAgICAgcmV0dXJuIHJ1bjtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlcG9ydFJ1bm5pbmcoKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLldhaXRpbmc6XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZDpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7c3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlJ1bm5pbmcsIGN1cnJlbnQ6IDAsIHRvdGFsfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRTdGF0dXMoc3RhdHVzOiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIHN0YXR1cywgY3VycmVudCwgdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuV2FpdGluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIHN0YXR1cyB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlcG9ydFByb2dyZXNzKGN1cnJlbnQ6IG51bWJlciwgdG90YWw/OiBudW1iZXIsIHN0YXR1cz86IHN0cmluZykge1xuICAgICAgICAgICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nOlxuICAgICAgICAgICAgICAgIHByb2dyZXNzKHsgc3RhdGU6IGN1cnJlbnRTdGF0ZSwgY3VycmVudCwgdG90YWwsIHN0YXR1cyB9LCBjb250ZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnRleHQucmVwb3J0UnVubmluZygpO1xuICAgICAgICBsZXQgcmVzdWx0ID0gZm4oaS5vcHRpb25zIGFzIE9wdFQsIGNvbnRleHQpO1xuXG4gICAgICAgIGlmIChpc1Byb21pc2UocmVzdWx0KSkge1xuICAgICAgICAgIHJlc3VsdCA9IGZyb20ocmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIGlmICghaXNPYnNlcnZhYmxlKHJlc3VsdCkpIHtcbiAgICAgICAgICByZXN1bHQgPSBvZihyZXN1bHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWFuYWdlIHNvbWUgc3RhdGUgYXV0b21hdGljYWxseS5cbiAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogMCwgdG90YWw6IDEgfSwgY29udGV4dCk7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChyZXN1bHQucGlwZShcbiAgICAgICAgICB0YXAoKCkgPT4ge1xuICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5TdG9wcGVkIH0sIGNvbnRleHQpO1xuICAgICAgICAgIH0pLFxuICAgICAgICApLnN1YnNjcmliZShcbiAgICAgICAgICBtZXNzYWdlID0+IG9ic2VydmVyLm5leHQobWVzc2FnZSBhcyBPdXRUKSxcbiAgICAgICAgICBlcnJvciA9PiBvYnNlcnZlci5lcnJvcihlcnJvciksXG4gICAgICAgICAgKCkgPT4gb2JzZXJ2ZXIuY29tcGxldGUoKSxcbiAgICAgICAgKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMuZm9yRWFjaCh4ID0+IHgudW5zdWJzY3JpYmUoKSk7XG4gICAgICAgIGlucHV0U3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGhhbmRsZXIsXG4gICAgW0J1aWxkZXJTeW1ib2xdOiB0cnVlLFxuICAgIFtCdWlsZGVyVmVyc2lvblN5bWJvbF06IHJlcXVpcmUoJy4uL3BhY2thZ2UuanNvbicpLnZlcnNpb24sXG4gIH07XG59XG4iXX0=