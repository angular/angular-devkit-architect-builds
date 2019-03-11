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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvY3JlYXRlLWJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCwrQ0FBOEU7QUFDOUUsK0JBQW9GO0FBQ3BGLDhDQUFxQztBQUNyQywrQkFZZTtBQUNmLHlDQUEwRTtBQUMxRSx5REFBc0U7QUFHdEUsU0FBZ0IsYUFBYSxDQUkzQixFQUEwQjtJQUUxQixNQUFNLEdBQUcsR0FBRyxtQkFBWSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQXNDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFO1FBQzVFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDcEMsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELElBQUksWUFBWSxHQUF5QiwwQkFBb0IsQ0FBQyxPQUFPLENBQUM7UUFDdEUsTUFBTSxjQUFjLEdBQTRDLEVBQUUsQ0FBQztRQUNuRSxJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDeEIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZCxTQUFTLEdBQUcsQ0FBQyxLQUF1QjtZQUNsQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxTQUFTLFFBQVEsQ0FBQyxRQUE4QixFQUFFLE9BQXVCO1lBQ3ZFLFlBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQzlCLElB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Q0FBQyxFQUM5QixHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQzFCLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxPQUFPLEdBQUcsRUFBRTtnQkFDVixhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0wsT0FBTztRQUNQLENBQUMsd0JBQWEsQ0FBQyxFQUFFLElBQUk7UUFDckIsQ0FBQywrQkFBb0IsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE9BQU87S0FDM0QsQ0FBQztBQUNKLENBQUM7QUExTEQsc0NBMExDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuaW1wb3J0IHsgZXhwZXJpbWVudGFsLCBpc1Byb21pc2UsIGpzb24sIGxvZ2dpbmcgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlLCBTdWJzY3JpcHRpb24sIGZyb20sIGlzT2JzZXJ2YWJsZSwgb2YsIHRocm93RXJyb3IgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7IHRhcCB9IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcbmltcG9ydCB7XG4gIEJ1aWxkZXJDb250ZXh0LFxuICBCdWlsZGVySGFuZGxlckZuLFxuICBCdWlsZGVySW5mbyxcbiAgQnVpbGRlcklucHV0LFxuICBCdWlsZGVyT3V0cHV0LFxuICBCdWlsZGVyT3V0cHV0TGlrZSxcbiAgQnVpbGRlclByb2dyZXNzU3RhdGUsXG4gIFNjaGVkdWxlT3B0aW9ucyxcbiAgVGFyZ2V0LFxuICBUeXBlZEJ1aWxkZXJQcm9ncmVzcyxcbiAgdGFyZ2V0U3RyaW5nRnJvbVRhcmdldCxcbn0gZnJvbSAnLi9hcGknO1xuaW1wb3J0IHsgQnVpbGRlciwgQnVpbGRlclN5bWJvbCwgQnVpbGRlclZlcnNpb25TeW1ib2wgfSBmcm9tICcuL2ludGVybmFsJztcbmltcG9ydCB7IHNjaGVkdWxlQnlOYW1lLCBzY2hlZHVsZUJ5VGFyZ2V0IH0gZnJvbSAnLi9zY2hlZHVsZS1ieS1uYW1lJztcblxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQnVpbGRlcjxcbiAgT3B0VCBleHRlbmRzIGpzb24uSnNvbk9iamVjdCxcbiAgT3V0VCBleHRlbmRzIEJ1aWxkZXJPdXRwdXQgPSBCdWlsZGVyT3V0cHV0LFxuPihcbiAgZm46IEJ1aWxkZXJIYW5kbGVyRm48T3B0VD4sXG4pOiBCdWlsZGVyPE9wdFQ+IHtcbiAgY29uc3QgY2poID0gZXhwZXJpbWVudGFsLmpvYnMuY3JlYXRlSm9iSGFuZGxlcjtcbiAgY29uc3QgaGFuZGxlciA9IGNqaDxqc29uLkpzb25PYmplY3QsIEJ1aWxkZXJJbnB1dCwgT3V0VD4oKG9wdGlvbnMsIGNvbnRleHQpID0+IHtcbiAgICBjb25zdCBzY2hlZHVsZXIgPSBjb250ZXh0LnNjaGVkdWxlcjtcbiAgICBjb25zdCBwcm9ncmVzc0NoYW5uZWwgPSBjb250ZXh0LmNyZWF0ZUNoYW5uZWwoJ3Byb2dyZXNzJyk7XG4gICAgY29uc3QgbG9nQ2hhbm5lbCA9IGNvbnRleHQuY3JlYXRlQ2hhbm5lbCgnbG9nJyk7XG4gICAgbGV0IGN1cnJlbnRTdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUgPSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5TdG9wcGVkO1xuICAgIGNvbnN0IHRlYXJkb3duTG9naWNzOiBBcnJheTwoKSA9PiAoUHJvbWlzZUxpa2U8dm9pZD4gfCB2b2lkKT4gPSBbXTtcbiAgICBsZXQgdGVhcmluZ0Rvd24gPSBmYWxzZTtcbiAgICBsZXQgY3VycmVudCA9IDA7XG4gICAgbGV0IHN0YXR1cyA9ICcnO1xuICAgIGxldCB0b3RhbCA9IDE7XG5cbiAgICBmdW5jdGlvbiBsb2coZW50cnk6IGxvZ2dpbmcuTG9nRW50cnkpIHtcbiAgICAgIGxvZ0NoYW5uZWwubmV4dChlbnRyeSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHByb2dyZXNzKHByb2dyZXNzOiBUeXBlZEJ1aWxkZXJQcm9ncmVzcywgY29udGV4dDogQnVpbGRlckNvbnRleHQpIHtcbiAgICAgIGN1cnJlbnRTdGF0ZSA9IHByb2dyZXNzLnN0YXRlO1xuICAgICAgaWYgKHByb2dyZXNzLnN0YXRlID09PSBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nKSB7XG4gICAgICAgIGN1cnJlbnQgPSBwcm9ncmVzcy5jdXJyZW50O1xuICAgICAgICB0b3RhbCA9IHByb2dyZXNzLnRvdGFsICE9PSB1bmRlZmluZWQgPyBwcm9ncmVzcy50b3RhbCA6IHRvdGFsO1xuXG4gICAgICAgIGlmIChwcm9ncmVzcy5zdGF0dXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHByb2dyZXNzLnN0YXR1cyA9IHN0YXR1cztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0dXMgPSBwcm9ncmVzcy5zdGF0dXM7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcHJvZ3Jlc3NDaGFubmVsLm5leHQoe1xuICAgICAgICAuLi5wcm9ncmVzcyBhcyBqc29uLkpzb25PYmplY3QsXG4gICAgICAgIC4uLihjb250ZXh0LnRhcmdldCAmJiB7IHRhcmdldDogY29udGV4dC50YXJnZXQgfSksXG4gICAgICAgIC4uLihjb250ZXh0LmJ1aWxkZXIgJiYgeyBidWlsZGVyOiBjb250ZXh0LmJ1aWxkZXIgfSksXG4gICAgICAgIGlkOiBjb250ZXh0LmlkLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPE91dFQ+KG9ic2VydmVyID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbnM6IFN1YnNjcmlwdGlvbltdID0gW107XG5cbiAgICAgIGNvbnN0IGlucHV0U3Vic2NyaXB0aW9uID0gY29udGV4dC5pbmJvdW5kQnVzLnN1YnNjcmliZShcbiAgICAgICAgaSA9PiB7XG4gICAgICAgICAgc3dpdGNoIChpLmtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLlN0b3A6XG4gICAgICAgICAgICAgIC8vIFJ1biB0ZWFyZG93biBsb2dpYyB0aGVuIGNvbXBsZXRlLlxuICAgICAgICAgICAgICB0ZWFyaW5nRG93biA9IHRydWU7XG4gICAgICAgICAgICAgIFByb21pc2UuYWxsKHRlYXJkb3duTG9naWNzLm1hcChmbiA9PiBmbigpIHx8IFByb21pc2UucmVzb2x2ZSgpKSlcbiAgICAgICAgICAgICAgICAudGhlbigoKSA9PiBvYnNlcnZlci5jb21wbGV0ZSgpLCBlcnIgPT4gb2JzZXJ2ZXIuZXJyb3IoZXJyKSk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBleHBlcmltZW50YWwuam9icy5Kb2JJbmJvdW5kTWVzc2FnZUtpbmQuSW5wdXQ6XG4gICAgICAgICAgICAgIGlmICghdGVhcmluZ0Rvd24pIHtcbiAgICAgICAgICAgICAgICBvbklucHV0KGkudmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICk7XG5cbiAgICAgIGZ1bmN0aW9uIG9uSW5wdXQoaTogQnVpbGRlcklucHV0KSB7XG4gICAgICAgIGNvbnN0IGJ1aWxkZXIgPSBpLmluZm8gYXMgQnVpbGRlckluZm87XG4gICAgICAgIGNvbnN0IGxvZ2dlck5hbWUgPSBpLnRhcmdldFxuICAgICAgICAgID8gdGFyZ2V0U3RyaW5nRnJvbVRhcmdldChpLnRhcmdldCBhcyBUYXJnZXQpXG4gICAgICAgICAgOiBidWlsZGVyLmJ1aWxkZXJOYW1lO1xuICAgICAgICBjb25zdCBsb2dnZXIgPSBuZXcgbG9nZ2luZy5Mb2dnZXIobG9nZ2VyTmFtZSk7XG5cbiAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKGxvZ2dlci5zdWJzY3JpYmUoZW50cnkgPT4gbG9nKGVudHJ5KSkpO1xuXG4gICAgICAgIGNvbnN0IGNvbnRleHQ6IEJ1aWxkZXJDb250ZXh0ID0ge1xuICAgICAgICAgIGJ1aWxkZXIsXG4gICAgICAgICAgd29ya3NwYWNlUm9vdDogaS53b3Jrc3BhY2VSb290LFxuICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICB0YXJnZXQ6IGkudGFyZ2V0IGFzIFRhcmdldCxcbiAgICAgICAgICBsb2dnZXI6IGxvZ2dlcixcbiAgICAgICAgICBpZDogaS5pZCxcbiAgICAgICAgICBhc3luYyBzY2hlZHVsZVRhcmdldChcbiAgICAgICAgICAgIHRhcmdldDogVGFyZ2V0LFxuICAgICAgICAgICAgb3ZlcnJpZGVzOiBqc29uLkpzb25PYmplY3QgPSB7fSxcbiAgICAgICAgICAgIHNjaGVkdWxlT3B0aW9uczogU2NoZWR1bGVPcHRpb25zID0ge30sXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zdCBydW4gPSBhd2FpdCBzY2hlZHVsZUJ5VGFyZ2V0KHRhcmdldCwgb3ZlcnJpZGVzLCB7XG4gICAgICAgICAgICAgIHNjaGVkdWxlcixcbiAgICAgICAgICAgICAgbG9nZ2VyOiBzY2hlZHVsZU9wdGlvbnMubG9nZ2VyIHx8IGxvZ2dlci5jcmVhdGVDaGlsZCgnJyksXG4gICAgICAgICAgICAgIHdvcmtzcGFjZVJvb3Q6IGkud29ya3NwYWNlUm9vdCxcbiAgICAgICAgICAgICAgY3VycmVudERpcmVjdG9yeTogaS5jdXJyZW50RGlyZWN0b3J5LFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gc3Vic2NyaWJlIGVycm9ycyBhbmQgY29tcGxldGUuXG4gICAgICAgICAgICBzdWJzY3JpcHRpb25zLnB1c2gocnVuLnByb2dyZXNzLnN1YnNjcmliZShldmVudCA9PiBwcm9ncmVzc0NoYW5uZWwubmV4dChldmVudCkpKTtcblxuICAgICAgICAgICAgcmV0dXJuIHJ1bjtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFzeW5jIHNjaGVkdWxlQnVpbGRlcihcbiAgICAgICAgICAgIGJ1aWxkZXJOYW1lOiBzdHJpbmcsXG4gICAgICAgICAgICBvcHRpb25zOiBqc29uLkpzb25PYmplY3QgPSB7fSxcbiAgICAgICAgICAgIHNjaGVkdWxlT3B0aW9uczogU2NoZWR1bGVPcHRpb25zID0ge30sXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zdCBydW4gPSBhd2FpdCBzY2hlZHVsZUJ5TmFtZShidWlsZGVyTmFtZSwgb3B0aW9ucywge1xuICAgICAgICAgICAgICBzY2hlZHVsZXIsXG4gICAgICAgICAgICAgIGxvZ2dlcjogc2NoZWR1bGVPcHRpb25zLmxvZ2dlciB8fCBsb2dnZXIuY3JlYXRlQ2hpbGQoJycpLFxuICAgICAgICAgICAgICB3b3Jrc3BhY2VSb290OiBpLndvcmtzcGFjZVJvb3QsXG4gICAgICAgICAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IGkuY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN1YnNjcmliZSBlcnJvcnMgYW5kIGNvbXBsZXRlLlxuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5wdXNoKHJ1bi5wcm9ncmVzcy5zdWJzY3JpYmUoZXZlbnQgPT4gcHJvZ3Jlc3NDaGFubmVsLm5leHQoZXZlbnQpKSk7XG5cbiAgICAgICAgICAgIHJldHVybiBydW47XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhc3luYyBnZXRUYXJnZXRPcHRpb25zKHRhcmdldDogVGFyZ2V0KSB7XG4gICAgICAgICAgICByZXR1cm4gc2NoZWR1bGVyLnNjaGVkdWxlPFRhcmdldCwganNvbi5Kc29uVmFsdWUsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgICAgICAgICAgICAgICAgICcuLmdldFRhcmdldE9wdGlvbnMnLCB0YXJnZXQpLm91dHB1dC50b1Byb21pc2UoKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlcG9ydFJ1bm5pbmcoKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLldhaXRpbmc6XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuU3RvcHBlZDpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5SdW5uaW5nLCBjdXJyZW50OiAwLCB0b3RhbCAgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRTdGF0dXMoc3RhdHVzOiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIHN0YXR1cywgY3VycmVudCwgdG90YWwgIH0sIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLldhaXRpbmc6XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogY3VycmVudFN0YXRlLCBzdGF0dXMgfSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXBvcnRQcm9ncmVzcyhjdXJyZW50OiBudW1iZXIsIHRvdGFsPzogbnVtYmVyLCBzdGF0dXM/OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XG4gICAgICAgICAgICAgIGNhc2UgQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZzpcbiAgICAgICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBjdXJyZW50U3RhdGUsIGN1cnJlbnQsIHRvdGFsLCBzdGF0dXMgfSwgY29udGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhZGRUZWFyZG93bih0ZWFyZG93bjogKCkgPT4gKFByb21pc2U8dm9pZD4gfCB2b2lkKSk6IHZvaWQge1xuICAgICAgICAgICAgdGVhcmRvd25Mb2dpY3MucHVzaCh0ZWFyZG93bik7XG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBjb250ZXh0LnJlcG9ydFJ1bm5pbmcoKTtcbiAgICAgICAgbGV0IHJlc3VsdDogQnVpbGRlck91dHB1dExpa2U7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzdWx0ID0gZm4oaS5vcHRpb25zIGFzIE9wdFQsIGNvbnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gdGhyb3dFcnJvcihlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc1Byb21pc2UocmVzdWx0KSkge1xuICAgICAgICAgIHJlc3VsdCA9IGZyb20ocmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIGlmICghaXNPYnNlcnZhYmxlKHJlc3VsdCkpIHtcbiAgICAgICAgICByZXN1bHQgPSBvZihyZXN1bHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWFuYWdlIHNvbWUgc3RhdGUgYXV0b21hdGljYWxseS5cbiAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogMCwgdG90YWw6IDEgfSwgY29udGV4dCk7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMucHVzaChyZXN1bHQucGlwZShcbiAgICAgICAgICB0YXAoKCkgPT4ge1xuICAgICAgICAgICAgcHJvZ3Jlc3MoeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZywgY3VycmVudDogdG90YWwgfSwgY29udGV4dCk7XG4gICAgICAgICAgICBwcm9ncmVzcyh7IHN0YXRlOiBCdWlsZGVyUHJvZ3Jlc3NTdGF0ZS5TdG9wcGVkIH0sIGNvbnRleHQpO1xuICAgICAgICAgIH0pLFxuICAgICAgICApLnN1YnNjcmliZShcbiAgICAgICAgICBtZXNzYWdlID0+IG9ic2VydmVyLm5leHQobWVzc2FnZSBhcyBPdXRUKSxcbiAgICAgICAgICBlcnJvciA9PiBvYnNlcnZlci5lcnJvcihlcnJvciksXG4gICAgICAgICAgKCkgPT4gb2JzZXJ2ZXIuY29tcGxldGUoKSxcbiAgICAgICAgKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMuZm9yRWFjaCh4ID0+IHgudW5zdWJzY3JpYmUoKSk7XG4gICAgICAgIGlucHV0U3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGhhbmRsZXIsXG4gICAgW0J1aWxkZXJTeW1ib2xdOiB0cnVlLFxuICAgIFtCdWlsZGVyVmVyc2lvblN5bWJvbF06IHJlcXVpcmUoJy4uL3BhY2thZ2UuanNvbicpLnZlcnNpb24sXG4gIH07XG59XG4iXX0=