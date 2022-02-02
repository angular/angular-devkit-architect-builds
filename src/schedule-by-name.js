"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleByTarget = exports.scheduleByName = void 0;
const core_1 = require("@angular-devkit/core");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const api_1 = require("./api");
const progressSchema = require('./progress-schema.json');
let _uniqueId = 0;
async function scheduleByName(name, buildOptions, options) {
    const childLoggerName = options.target ? `{${(0, api_1.targetStringFromTarget)(options.target)}}` : name;
    const logger = options.logger.createChild(childLoggerName);
    const job = options.scheduler.schedule(name, {});
    let stateSubscription;
    const workspaceRoot = await options.workspaceRoot;
    const currentDirectory = await options.currentDirectory;
    const description = await job.description.toPromise();
    const info = description.info;
    const id = ++_uniqueId;
    const message = {
        id,
        currentDirectory,
        workspaceRoot,
        info: info,
        options: buildOptions,
        ...(options.target ? { target: options.target } : {}),
    };
    // Wait for the job to be ready.
    if (job.state !== core_1.experimental.jobs.JobState.Started) {
        stateSubscription = job.outboundBus.subscribe((event) => {
            if (event.kind === core_1.experimental.jobs.JobOutboundMessageKind.Start) {
                job.input.next(message);
            }
        }, () => { });
    }
    else {
        job.input.next(message);
    }
    const logChannelSub = job.getChannel('log').subscribe((entry) => {
        logger.next(entry);
    }, () => { });
    const s = job.outboundBus.subscribe({
        error() { },
        complete() {
            s.unsubscribe();
            logChannelSub.unsubscribe();
            if (stateSubscription) {
                stateSubscription.unsubscribe();
            }
        },
    });
    const output = job.output.pipe((0, operators_1.map)((output) => ({
        ...output,
        ...(options.target ? { target: options.target } : 0),
        info,
    })), (0, operators_1.shareReplay)());
    // If there's an analytics object, take the job channel and report it to the analytics.
    if (options.analytics) {
        const reporter = new core_1.analytics.AnalyticsReporter(options.analytics);
        job
            .getChannel('analytics')
            .subscribe((report) => reporter.report(report));
    }
    // Start the builder.
    output.pipe((0, operators_1.first)()).subscribe({
        error() { },
    });
    return {
        id,
        info,
        // This is a getter so that it always returns the next output, and not the same one.
        get result() {
            return output.pipe((0, operators_1.first)()).toPromise();
        },
        output,
        progress: job
            .getChannel('progress', progressSchema)
            .pipe((0, operators_1.shareReplay)(1)),
        stop() {
            job.stop();
            return job.outboundBus
                .pipe((0, operators_1.ignoreElements)(), (0, operators_1.catchError)(() => rxjs_1.EMPTY))
                .toPromise();
        },
    };
}
exports.scheduleByName = scheduleByName;
async function scheduleByTarget(target, overrides, options) {
    return scheduleByName(`{${(0, api_1.targetStringFromTarget)(target)}}`, overrides, {
        ...options,
        target,
        logger: options.logger,
    });
}
exports.scheduleByTarget = scheduleByTarget;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NoZWR1bGUtYnktbmFtZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvc2NoZWR1bGUtYnktbmFtZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7QUFFSCwrQ0FBOEU7QUFDOUUsK0JBQTJDO0FBQzNDLDhDQUFxRjtBQUNyRiwrQkFRZTtBQUVmLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBRXpELElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUVYLEtBQUssVUFBVSxjQUFjLENBQ2xDLElBQVksRUFDWixZQUE2QixFQUM3QixPQU9DO0lBRUQsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFBLDRCQUFzQixFQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDOUYsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDM0QsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQWtDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRixJQUFJLGlCQUErQixDQUFDO0lBRXBDLE1BQU0sYUFBYSxHQUFHLE1BQU0sT0FBTyxDQUFDLGFBQWEsQ0FBQztJQUNsRCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sT0FBTyxDQUFDLGdCQUFnQixDQUFDO0lBRXhELE1BQU0sV0FBVyxHQUFHLE1BQU0sR0FBRyxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUN0RCxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsSUFBbUIsQ0FBQztJQUM3QyxNQUFNLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQztJQUV2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YUFDVixVQUFVLENBQXdCLFVBQVUsRUFBRSxjQUFjLENBQUM7YUFDN0QsSUFBSSxDQUFDLElBQUEsdUJBQVcsRUFBQyxDQUFDLENBQUMsQ0FBQztRQUN2QixJQUFJO1lBQ0YsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBRVgsT0FBTyxHQUFHLENBQUMsV0FBVztpQkFDbkIsSUFBSSxDQUNILElBQUEsMEJBQWMsR0FBRSxFQUNoQixJQUFBLHNCQUFVLEVBQUMsR0FBRyxFQUFFLENBQUMsWUFBSyxDQUFDLENBQ3hCO2lCQUNBLFNBQVMsRUFBRSxDQUFDO1FBQ2pCLENBQUM7S0FDRixDQUFDO0FBQ0osQ0FBQztBQTlHRCx3Q0E4R0M7QUFFTSxLQUFLLFVBQVUsZ0JBQWdCLENBQ3BDLE1BQWMsRUFDZCxTQUEwQixFQUMxQixPQU1DO0lBRUQsT0FBTyxjQUFjLENBQUMsSUFBSSxJQUFBLDRCQUFzQixFQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFO1FBQ3RFLEdBQUcsT0FBTztRQUNWLE1BQU07UUFDTixNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU07S0FDdkIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQWhCRCw0Q0FnQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgYW5hbHl0aWNzLCBleHBlcmltZW50YWwsIGpzb24sIGxvZ2dpbmcgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBFTVBUWSwgU3Vic2NyaXB0aW9uIH0gZnJvbSAncnhqcyc7XG5pbXBvcnQgeyBjYXRjaEVycm9yLCBmaXJzdCwgaWdub3JlRWxlbWVudHMsIG1hcCwgc2hhcmVSZXBsYXkgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQge1xuICBCdWlsZGVySW5mbyxcbiAgQnVpbGRlcklucHV0LFxuICBCdWlsZGVyT3V0cHV0LFxuICBCdWlsZGVyUHJvZ3Jlc3NSZXBvcnQsXG4gIEJ1aWxkZXJSdW4sXG4gIFRhcmdldCxcbiAgdGFyZ2V0U3RyaW5nRnJvbVRhcmdldCxcbn0gZnJvbSAnLi9hcGknO1xuXG5jb25zdCBwcm9ncmVzc1NjaGVtYSA9IHJlcXVpcmUoJy4vcHJvZ3Jlc3Mtc2NoZW1hLmpzb24nKTtcblxubGV0IF91bmlxdWVJZCA9IDA7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzY2hlZHVsZUJ5TmFtZShcbiAgbmFtZTogc3RyaW5nLFxuICBidWlsZE9wdGlvbnM6IGpzb24uSnNvbk9iamVjdCxcbiAgb3B0aW9uczoge1xuICAgIHRhcmdldD86IFRhcmdldDtcbiAgICBzY2hlZHVsZXI6IGV4cGVyaW1lbnRhbC5qb2JzLlNjaGVkdWxlcjtcbiAgICBsb2dnZXI6IGxvZ2dpbmcuTG9nZ2VyQXBpO1xuICAgIHdvcmtzcGFjZVJvb3Q6IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPjtcbiAgICBjdXJyZW50RGlyZWN0b3J5OiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz47XG4gICAgYW5hbHl0aWNzPzogYW5hbHl0aWNzLkFuYWx5dGljcztcbiAgfSxcbik6IFByb21pc2U8QnVpbGRlclJ1bj4ge1xuICBjb25zdCBjaGlsZExvZ2dlck5hbWUgPSBvcHRpb25zLnRhcmdldCA/IGB7JHt0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KG9wdGlvbnMudGFyZ2V0KX19YCA6IG5hbWU7XG4gIGNvbnN0IGxvZ2dlciA9IG9wdGlvbnMubG9nZ2VyLmNyZWF0ZUNoaWxkKGNoaWxkTG9nZ2VyTmFtZSk7XG4gIGNvbnN0IGpvYiA9IG9wdGlvbnMuc2NoZWR1bGVyLnNjaGVkdWxlPHt9LCBCdWlsZGVySW5wdXQsIEJ1aWxkZXJPdXRwdXQ+KG5hbWUsIHt9KTtcbiAgbGV0IHN0YXRlU3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb247XG5cbiAgY29uc3Qgd29ya3NwYWNlUm9vdCA9IGF3YWl0IG9wdGlvbnMud29ya3NwYWNlUm9vdDtcbiAgY29uc3QgY3VycmVudERpcmVjdG9yeSA9IGF3YWl0IG9wdGlvbnMuY3VycmVudERpcmVjdG9yeTtcblxuICBjb25zdCBkZXNjcmlwdGlvbiA9IGF3YWl0IGpvYi5kZXNjcmlwdGlvbi50b1Byb21pc2UoKTtcbiAgY29uc3QgaW5mbyA9IGRlc2NyaXB0aW9uLmluZm8gYXMgQnVpbGRlckluZm87XG4gIGNvbnN0IGlkID0gKytfdW5pcXVlSWQ7XG5cbiAgY29uc3QgbWVzc2FnZSA9IHtcbiAgICBpZCxcbiAgICBjdXJyZW50RGlyZWN0b3J5LFxuICAgIHdvcmtzcGFjZVJvb3QsXG4gICAgaW5mbzogaW5mbyxcbiAgICBvcHRpb25zOiBidWlsZE9wdGlvbnMsXG4gICAgLi4uKG9wdGlvbnMudGFyZ2V0ID8geyB0YXJnZXQ6IG9wdGlvbnMudGFyZ2V0IH0gOiB7fSksXG4gIH07XG5cbiAgLy8gV2FpdCBmb3IgdGhlIGpvYiB0byBiZSByZWFkeS5cbiAgaWYgKGpvYi5zdGF0ZSAhPT0gZXhwZXJpbWVudGFsLmpvYnMuSm9iU3RhdGUuU3RhcnRlZCkge1xuICAgIHN0YXRlU3Vic2NyaXB0aW9uID0gam9iLm91dGJvdW5kQnVzLnN1YnNjcmliZShcbiAgICAgIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQua2luZCA9PT0gZXhwZXJpbWVudGFsLmpvYnMuSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5TdGFydCkge1xuICAgICAgICAgIGpvYi5pbnB1dC5uZXh0KG1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgKCkgPT4ge30sXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBqb2IuaW5wdXQubmV4dChtZXNzYWdlKTtcbiAgfVxuXG4gIGNvbnN0IGxvZ0NoYW5uZWxTdWIgPSBqb2IuZ2V0Q2hhbm5lbDxsb2dnaW5nLkxvZ0VudHJ5PignbG9nJykuc3Vic2NyaWJlKFxuICAgIChlbnRyeSkgPT4ge1xuICAgICAgbG9nZ2VyLm5leHQoZW50cnkpO1xuICAgIH0sXG4gICAgKCkgPT4ge30sXG4gICk7XG5cbiAgY29uc3QgcyA9IGpvYi5vdXRib3VuZEJ1cy5zdWJzY3JpYmUoe1xuICAgIGVycm9yKCkge30sXG4gICAgY29tcGxldGUoKSB7XG4gICAgICBzLnVuc3Vic2NyaWJlKCk7XG4gICAgICBsb2dDaGFubmVsU3ViLnVuc3Vic2NyaWJlKCk7XG4gICAgICBpZiAoc3RhdGVTdWJzY3JpcHRpb24pIHtcbiAgICAgICAgc3RhdGVTdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbiAgY29uc3Qgb3V0cHV0ID0gam9iLm91dHB1dC5waXBlKFxuICAgIG1hcChcbiAgICAgIChvdXRwdXQpID0+XG4gICAgICAgICh7XG4gICAgICAgICAgLi4ub3V0cHV0LFxuICAgICAgICAgIC4uLihvcHRpb25zLnRhcmdldCA/IHsgdGFyZ2V0OiBvcHRpb25zLnRhcmdldCB9IDogMCksXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSBhcyBCdWlsZGVyT3V0cHV0KSxcbiAgICApLFxuICAgIHNoYXJlUmVwbGF5KCksXG4gICk7XG5cbiAgLy8gSWYgdGhlcmUncyBhbiBhbmFseXRpY3Mgb2JqZWN0LCB0YWtlIHRoZSBqb2IgY2hhbm5lbCBhbmQgcmVwb3J0IGl0IHRvIHRoZSBhbmFseXRpY3MuXG4gIGlmIChvcHRpb25zLmFuYWx5dGljcykge1xuICAgIGNvbnN0IHJlcG9ydGVyID0gbmV3IGFuYWx5dGljcy5BbmFseXRpY3NSZXBvcnRlcihvcHRpb25zLmFuYWx5dGljcyk7XG4gICAgam9iXG4gICAgICAuZ2V0Q2hhbm5lbDxhbmFseXRpY3MuQW5hbHl0aWNzUmVwb3J0PignYW5hbHl0aWNzJylcbiAgICAgIC5zdWJzY3JpYmUoKHJlcG9ydCkgPT4gcmVwb3J0ZXIucmVwb3J0KHJlcG9ydCkpO1xuICB9XG4gIC8vIFN0YXJ0IHRoZSBidWlsZGVyLlxuICBvdXRwdXQucGlwZShmaXJzdCgpKS5zdWJzY3JpYmUoe1xuICAgIGVycm9yKCkge30sXG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgaWQsXG4gICAgaW5mbyxcbiAgICAvLyBUaGlzIGlzIGEgZ2V0dGVyIHNvIHRoYXQgaXQgYWx3YXlzIHJldHVybnMgdGhlIG5leHQgb3V0cHV0LCBhbmQgbm90IHRoZSBzYW1lIG9uZS5cbiAgICBnZXQgcmVzdWx0KCkge1xuICAgICAgcmV0dXJuIG91dHB1dC5waXBlKGZpcnN0KCkpLnRvUHJvbWlzZSgpO1xuICAgIH0sXG4gICAgb3V0cHV0LFxuICAgIHByb2dyZXNzOiBqb2JcbiAgICAgIC5nZXRDaGFubmVsPEJ1aWxkZXJQcm9ncmVzc1JlcG9ydD4oJ3Byb2dyZXNzJywgcHJvZ3Jlc3NTY2hlbWEpXG4gICAgICAucGlwZShzaGFyZVJlcGxheSgxKSksXG4gICAgc3RvcCgpIHtcbiAgICAgIGpvYi5zdG9wKCk7XG5cbiAgICAgIHJldHVybiBqb2Iub3V0Ym91bmRCdXNcbiAgICAgICAgLnBpcGUoXG4gICAgICAgICAgaWdub3JlRWxlbWVudHMoKSxcbiAgICAgICAgICBjYXRjaEVycm9yKCgpID0+IEVNUFRZKSxcbiAgICAgICAgKVxuICAgICAgICAudG9Qcm9taXNlKCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNjaGVkdWxlQnlUYXJnZXQoXG4gIHRhcmdldDogVGFyZ2V0LFxuICBvdmVycmlkZXM6IGpzb24uSnNvbk9iamVjdCxcbiAgb3B0aW9uczoge1xuICAgIHNjaGVkdWxlcjogZXhwZXJpbWVudGFsLmpvYnMuU2NoZWR1bGVyO1xuICAgIGxvZ2dlcjogbG9nZ2luZy5Mb2dnZXJBcGk7XG4gICAgd29ya3NwYWNlUm9vdDogc3RyaW5nIHwgUHJvbWlzZTxzdHJpbmc+O1xuICAgIGN1cnJlbnREaXJlY3Rvcnk6IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPjtcbiAgICBhbmFseXRpY3M/OiBhbmFseXRpY3MuQW5hbHl0aWNzO1xuICB9LFxuKTogUHJvbWlzZTxCdWlsZGVyUnVuPiB7XG4gIHJldHVybiBzY2hlZHVsZUJ5TmFtZShgeyR7dGFyZ2V0U3RyaW5nRnJvbVRhcmdldCh0YXJnZXQpfX1gLCBvdmVycmlkZXMsIHtcbiAgICAuLi5vcHRpb25zLFxuICAgIHRhcmdldCxcbiAgICBsb2dnZXI6IG9wdGlvbnMubG9nZ2VyLFxuICB9KTtcbn1cbiJdfQ==