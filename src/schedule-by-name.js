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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NoZWR1bGUtYnktbmFtZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvc2NoZWR1bGUtYnktbmFtZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7QUFFSCwrQ0FBOEU7QUFDOUUsK0JBQTJDO0FBQzNDLDhDQUFxRjtBQUNyRiwrQkFRZTtBQUVmLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBRXpELElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUVYLEtBQUssVUFBVSxjQUFjLENBQ2xDLElBQVksRUFDWixZQUE2QixFQUM3QixPQU9DO0lBRUQsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFBLDRCQUFzQixFQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDOUYsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDM0QsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQWtDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRixJQUFJLGlCQUErQixDQUFDO0lBRXBDLE1BQU0sYUFBYSxHQUFHLE1BQU0sT0FBTyxDQUFDLGFBQWEsQ0FBQztJQUNsRCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sT0FBTyxDQUFDLGdCQUFnQixDQUFDO0lBRXhELE1BQU0sV0FBVyxHQUFHLE1BQU0sR0FBRyxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUN0RCxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsSUFBbUIsQ0FBQztJQUM3QyxNQUFNLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQztJQUV2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O2FBQ1YsVUFBVSxDQUF3QixVQUFVLEVBQUUsY0FBYyxDQUFDO2FBQzdELElBQUksQ0FBQyxJQUFBLHVCQUFXLEVBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkIsSUFBSTtZQUNGLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUVYLE9BQU8sR0FBRyxDQUFDLFdBQVc7aUJBQ25CLElBQUksQ0FDSCxJQUFBLDBCQUFjLEdBQUUsRUFDaEIsSUFBQSxzQkFBVSxFQUFDLEdBQUcsRUFBRSxDQUFDLFlBQUssQ0FBQyxDQUN4QjtpQkFDQSxTQUFTLEVBQUUsQ0FBQztRQUNqQixDQUFDO0tBQ0YsQ0FBQztBQUNKLENBQUM7QUE5R0Qsd0NBOEdDO0FBRU0sS0FBSyxVQUFVLGdCQUFnQixDQUNwQyxNQUFjLEVBQ2QsU0FBMEIsRUFDMUIsT0FNQztJQUVELE9BQU8sY0FBYyxDQUFDLElBQUksSUFBQSw0QkFBc0IsRUFBQyxNQUFNLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRTtRQUN0RSxHQUFHLE9BQU87UUFDVixNQUFNO1FBQ04sTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO0tBQ3ZCLENBQUMsQ0FBQztBQUNMLENBQUM7QUFoQkQsNENBZ0JDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGFuYWx5dGljcywgZXhwZXJpbWVudGFsLCBqc29uLCBsb2dnaW5nIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHsgRU1QVFksIFN1YnNjcmlwdGlvbiB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHsgY2F0Y2hFcnJvciwgZmlyc3QsIGlnbm9yZUVsZW1lbnRzLCBtYXAsIHNoYXJlUmVwbGF5IH0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgQnVpbGRlckluZm8sXG4gIEJ1aWxkZXJJbnB1dCxcbiAgQnVpbGRlck91dHB1dCxcbiAgQnVpbGRlclByb2dyZXNzUmVwb3J0LFxuICBCdWlsZGVyUnVuLFxuICBUYXJnZXQsXG4gIHRhcmdldFN0cmluZ0Zyb21UYXJnZXQsXG59IGZyb20gJy4vYXBpJztcblxuY29uc3QgcHJvZ3Jlc3NTY2hlbWEgPSByZXF1aXJlKCcuL3Byb2dyZXNzLXNjaGVtYS5qc29uJyk7XG5cbmxldCBfdW5pcXVlSWQgPSAwO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2NoZWR1bGVCeU5hbWUoXG4gIG5hbWU6IHN0cmluZyxcbiAgYnVpbGRPcHRpb25zOiBqc29uLkpzb25PYmplY3QsXG4gIG9wdGlvbnM6IHtcbiAgICB0YXJnZXQ/OiBUYXJnZXQ7XG4gICAgc2NoZWR1bGVyOiBleHBlcmltZW50YWwuam9icy5TY2hlZHVsZXI7XG4gICAgbG9nZ2VyOiBsb2dnaW5nLkxvZ2dlckFwaTtcbiAgICB3b3Jrc3BhY2VSb290OiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz47XG4gICAgY3VycmVudERpcmVjdG9yeTogc3RyaW5nIHwgUHJvbWlzZTxzdHJpbmc+O1xuICAgIGFuYWx5dGljcz86IGFuYWx5dGljcy5BbmFseXRpY3M7XG4gIH0sXG4pOiBQcm9taXNlPEJ1aWxkZXJSdW4+IHtcbiAgY29uc3QgY2hpbGRMb2dnZXJOYW1lID0gb3B0aW9ucy50YXJnZXQgPyBgeyR7dGFyZ2V0U3RyaW5nRnJvbVRhcmdldChvcHRpb25zLnRhcmdldCl9fWAgOiBuYW1lO1xuICBjb25zdCBsb2dnZXIgPSBvcHRpb25zLmxvZ2dlci5jcmVhdGVDaGlsZChjaGlsZExvZ2dlck5hbWUpO1xuICBjb25zdCBqb2IgPSBvcHRpb25zLnNjaGVkdWxlci5zY2hlZHVsZTx7fSwgQnVpbGRlcklucHV0LCBCdWlsZGVyT3V0cHV0PihuYW1lLCB7fSk7XG4gIGxldCBzdGF0ZVN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uO1xuXG4gIGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBhd2FpdCBvcHRpb25zLndvcmtzcGFjZVJvb3Q7XG4gIGNvbnN0IGN1cnJlbnREaXJlY3RvcnkgPSBhd2FpdCBvcHRpb25zLmN1cnJlbnREaXJlY3Rvcnk7XG5cbiAgY29uc3QgZGVzY3JpcHRpb24gPSBhd2FpdCBqb2IuZGVzY3JpcHRpb24udG9Qcm9taXNlKCk7XG4gIGNvbnN0IGluZm8gPSBkZXNjcmlwdGlvbi5pbmZvIGFzIEJ1aWxkZXJJbmZvO1xuICBjb25zdCBpZCA9ICsrX3VuaXF1ZUlkO1xuXG4gIGNvbnN0IG1lc3NhZ2UgPSB7XG4gICAgaWQsXG4gICAgY3VycmVudERpcmVjdG9yeSxcbiAgICB3b3Jrc3BhY2VSb290LFxuICAgIGluZm86IGluZm8sXG4gICAgb3B0aW9uczogYnVpbGRPcHRpb25zLFxuICAgIC4uLihvcHRpb25zLnRhcmdldCA/IHsgdGFyZ2V0OiBvcHRpb25zLnRhcmdldCB9IDoge30pLFxuICB9O1xuXG4gIC8vIFdhaXQgZm9yIHRoZSBqb2IgdG8gYmUgcmVhZHkuXG4gIGlmIChqb2Iuc3RhdGUgIT09IGV4cGVyaW1lbnRhbC5qb2JzLkpvYlN0YXRlLlN0YXJ0ZWQpIHtcbiAgICBzdGF0ZVN1YnNjcmlwdGlvbiA9IGpvYi5vdXRib3VuZEJ1cy5zdWJzY3JpYmUoXG4gICAgICAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50LmtpbmQgPT09IGV4cGVyaW1lbnRhbC5qb2JzLkpvYk91dGJvdW5kTWVzc2FnZUtpbmQuU3RhcnQpIHtcbiAgICAgICAgICBqb2IuaW5wdXQubmV4dChtZXNzYWdlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgICgpID0+IHt9LFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgam9iLmlucHV0Lm5leHQobWVzc2FnZSk7XG4gIH1cblxuICBjb25zdCBsb2dDaGFubmVsU3ViID0gam9iLmdldENoYW5uZWw8bG9nZ2luZy5Mb2dFbnRyeT4oJ2xvZycpLnN1YnNjcmliZShcbiAgICAoZW50cnkpID0+IHtcbiAgICAgIGxvZ2dlci5uZXh0KGVudHJ5KTtcbiAgICB9LFxuICAgICgpID0+IHt9LFxuICApO1xuXG4gIGNvbnN0IHMgPSBqb2Iub3V0Ym91bmRCdXMuc3Vic2NyaWJlKHtcbiAgICBlcnJvcigpIHt9LFxuICAgIGNvbXBsZXRlKCkge1xuICAgICAgcy51bnN1YnNjcmliZSgpO1xuICAgICAgbG9nQ2hhbm5lbFN1Yi51bnN1YnNjcmliZSgpO1xuICAgICAgaWYgKHN0YXRlU3Vic2NyaXB0aW9uKSB7XG4gICAgICAgIHN0YXRlU3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG4gIGNvbnN0IG91dHB1dCA9IGpvYi5vdXRwdXQucGlwZShcbiAgICBtYXAoXG4gICAgICAob3V0cHV0KSA9PlxuICAgICAgICAoe1xuICAgICAgICAgIC4uLm91dHB1dCxcbiAgICAgICAgICAuLi4ob3B0aW9ucy50YXJnZXQgPyB7IHRhcmdldDogb3B0aW9ucy50YXJnZXQgfSA6IDApLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBCdWlsZGVyT3V0cHV0KSxcbiAgICApLFxuICAgIHNoYXJlUmVwbGF5KCksXG4gICk7XG5cbiAgLy8gSWYgdGhlcmUncyBhbiBhbmFseXRpY3Mgb2JqZWN0LCB0YWtlIHRoZSBqb2IgY2hhbm5lbCBhbmQgcmVwb3J0IGl0IHRvIHRoZSBhbmFseXRpY3MuXG4gIGlmIChvcHRpb25zLmFuYWx5dGljcykge1xuICAgIGNvbnN0IHJlcG9ydGVyID0gbmV3IGFuYWx5dGljcy5BbmFseXRpY3NSZXBvcnRlcihvcHRpb25zLmFuYWx5dGljcyk7XG4gICAgam9iXG4gICAgICAuZ2V0Q2hhbm5lbDxhbmFseXRpY3MuQW5hbHl0aWNzUmVwb3J0PignYW5hbHl0aWNzJylcbiAgICAgIC5zdWJzY3JpYmUoKHJlcG9ydCkgPT4gcmVwb3J0ZXIucmVwb3J0KHJlcG9ydCkpO1xuICB9XG4gIC8vIFN0YXJ0IHRoZSBidWlsZGVyLlxuICBvdXRwdXQucGlwZShmaXJzdCgpKS5zdWJzY3JpYmUoe1xuICAgIGVycm9yKCkge30sXG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgaWQsXG4gICAgaW5mbyxcbiAgICAvLyBUaGlzIGlzIGEgZ2V0dGVyIHNvIHRoYXQgaXQgYWx3YXlzIHJldHVybnMgdGhlIG5leHQgb3V0cHV0LCBhbmQgbm90IHRoZSBzYW1lIG9uZS5cbiAgICBnZXQgcmVzdWx0KCkge1xuICAgICAgcmV0dXJuIG91dHB1dC5waXBlKGZpcnN0KCkpLnRvUHJvbWlzZSgpO1xuICAgIH0sXG4gICAgb3V0cHV0LFxuICAgIHByb2dyZXNzOiBqb2JcbiAgICAgIC5nZXRDaGFubmVsPEJ1aWxkZXJQcm9ncmVzc1JlcG9ydD4oJ3Byb2dyZXNzJywgcHJvZ3Jlc3NTY2hlbWEpXG4gICAgICAucGlwZShzaGFyZVJlcGxheSgxKSksXG4gICAgc3RvcCgpIHtcbiAgICAgIGpvYi5zdG9wKCk7XG5cbiAgICAgIHJldHVybiBqb2Iub3V0Ym91bmRCdXNcbiAgICAgICAgLnBpcGUoXG4gICAgICAgICAgaWdub3JlRWxlbWVudHMoKSxcbiAgICAgICAgICBjYXRjaEVycm9yKCgpID0+IEVNUFRZKSxcbiAgICAgICAgKVxuICAgICAgICAudG9Qcm9taXNlKCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNjaGVkdWxlQnlUYXJnZXQoXG4gIHRhcmdldDogVGFyZ2V0LFxuICBvdmVycmlkZXM6IGpzb24uSnNvbk9iamVjdCxcbiAgb3B0aW9uczoge1xuICAgIHNjaGVkdWxlcjogZXhwZXJpbWVudGFsLmpvYnMuU2NoZWR1bGVyO1xuICAgIGxvZ2dlcjogbG9nZ2luZy5Mb2dnZXJBcGk7XG4gICAgd29ya3NwYWNlUm9vdDogc3RyaW5nIHwgUHJvbWlzZTxzdHJpbmc+O1xuICAgIGN1cnJlbnREaXJlY3Rvcnk6IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPjtcbiAgICBhbmFseXRpY3M/OiBhbmFseXRpY3MuQW5hbHl0aWNzO1xuICB9LFxuKTogUHJvbWlzZTxCdWlsZGVyUnVuPiB7XG4gIHJldHVybiBzY2hlZHVsZUJ5TmFtZShgeyR7dGFyZ2V0U3RyaW5nRnJvbVRhcmdldCh0YXJnZXQpfX1gLCBvdmVycmlkZXMsIHtcbiAgICAuLi5vcHRpb25zLFxuICAgIHRhcmdldCxcbiAgICBsb2dnZXI6IG9wdGlvbnMubG9nZ2VyLFxuICB9KTtcbn1cbiJdfQ==