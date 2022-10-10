"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleTargetAndForget = exports.targetFromTargetString = exports.targetStringFromTarget = exports.fromAsyncIterable = exports.isBuilderOutput = exports.BuilderProgressState = void 0;
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const progress_schema_1 = require("./progress-schema");
Object.defineProperty(exports, "BuilderProgressState", { enumerable: true, get: function () { return progress_schema_1.State; } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isBuilderOutput(obj) {
    if (!obj || typeof obj.then === 'function' || typeof obj.subscribe === 'function') {
        return false;
    }
    if (typeof obj[Symbol.asyncIterator] === 'function') {
        return false;
    }
    return typeof obj.success === 'boolean';
}
exports.isBuilderOutput = isBuilderOutput;
function fromAsyncIterable(iterable) {
    return new rxjs_1.Observable((subscriber) => {
        handleAsyncIterator(subscriber, iterable[Symbol.asyncIterator]()).then(() => subscriber.complete(), (error) => subscriber.error(error));
    });
}
exports.fromAsyncIterable = fromAsyncIterable;
async function handleAsyncIterator(subscriber, iterator) {
    var _a;
    const teardown = new Promise((resolve) => subscriber.add(() => resolve()));
    try {
        while (!subscriber.closed) {
            const result = await Promise.race([teardown, iterator.next()]);
            if (!result || result.done) {
                break;
            }
            subscriber.next(result.value);
        }
    }
    finally {
        await ((_a = iterator.return) === null || _a === void 0 ? void 0 : _a.call(iterator));
    }
}
/**
 * Returns a string of "project:target[:configuration]" for the target object.
 */
function targetStringFromTarget({ project, target, configuration }) {
    return `${project}:${target}${configuration !== undefined ? ':' + configuration : ''}`;
}
exports.targetStringFromTarget = targetStringFromTarget;
/**
 * Return a Target tuple from a string.
 */
function targetFromTargetString(str) {
    const tuple = str.split(/:/, 3);
    if (tuple.length < 2) {
        throw new Error('Invalid target string: ' + JSON.stringify(str));
    }
    return {
        project: tuple[0],
        target: tuple[1],
        ...(tuple[2] !== undefined && { configuration: tuple[2] }),
    };
}
exports.targetFromTargetString = targetFromTargetString;
/**
 * Schedule a target, and forget about its run. This will return an observable of outputs, that
 * as a a teardown will stop the target from running. This means that the Run object this returns
 * should not be shared.
 *
 * The reason this is not part of the Context interface is to keep the Context as normal form as
 * possible. This is really an utility that people would implement in their project.
 *
 * @param context The context of your current execution.
 * @param target The target to schedule.
 * @param overrides Overrides that are used in the target.
 * @param scheduleOptions Additional scheduling options.
 */
function scheduleTargetAndForget(context, target, overrides, scheduleOptions) {
    let resolve = null;
    const promise = new Promise((r) => (resolve = r));
    context.addTeardown(() => promise);
    return (0, rxjs_1.from)(context.scheduleTarget(target, overrides, scheduleOptions)).pipe((0, operators_1.switchMap)((run) => new rxjs_1.Observable((observer) => {
        const subscription = run.output.subscribe(observer);
        return () => {
            subscription.unsubscribe();
            // We can properly ignore the floating promise as it's a "reverse" promise; the teardown
            // is waiting for the resolve.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            run.stop().then(resolve);
        };
    })));
}
exports.scheduleTargetAndForget = scheduleTargetAndForget;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L3NyYy9hcGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBR0gsK0JBQTJFO0FBQzNFLDhDQUEyQztBQUkzQyx1REFBaUc7QUFHeEYscUdBSFMsdUJBQW9CLE9BR1Q7QUFvUDdCLDhEQUE4RDtBQUM5RCxTQUFnQixlQUFlLENBQUMsR0FBUTtJQUN0QyxJQUFJLENBQUMsR0FBRyxJQUFJLE9BQU8sR0FBRyxDQUFDLElBQUksS0FBSyxVQUFVLElBQUksT0FBTyxHQUFHLENBQUMsU0FBUyxLQUFLLFVBQVUsRUFBRTtRQUNqRixPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsSUFBSSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLEtBQUssVUFBVSxFQUFFO1FBQ25ELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxPQUFPLE9BQU8sR0FBRyxDQUFDLE9BQU8sS0FBSyxTQUFTLENBQUM7QUFDMUMsQ0FBQztBQVZELDBDQVVDO0FBRUQsU0FBZ0IsaUJBQWlCLENBQUksUUFBMEI7SUFDN0QsT0FBTyxJQUFJLGlCQUFVLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRTtRQUNuQyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUNwRSxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLEVBQzNCLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUNuQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBUEQsOENBT0M7QUFFRCxLQUFLLFVBQVUsbUJBQW1CLENBQ2hDLFVBQXlCLEVBQ3pCLFFBQTBCOztJ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QztBQUNKLENBQUM7QUExQkQsMERBMEJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGFuYWx5dGljcywganNvbiwgbG9nZ2luZyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFN1YnNjcmliYWJsZU9yUHJvbWlzZSwgU3Vic2NyaWJlciwgZnJvbSB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHsgc3dpdGNoTWFwIH0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuaW1wb3J0IHsgU2NoZW1hIGFzIFJlYWxCdWlsZGVySW5wdXQsIFRhcmdldCBhcyBSZWFsVGFyZ2V0IH0gZnJvbSAnLi9pbnB1dC1zY2hlbWEnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuL2pvYnMnO1xuaW1wb3J0IHsgU2NoZW1hIGFzIFJlYWxCdWlsZGVyT3V0cHV0IH0gZnJvbSAnLi9vdXRwdXQtc2NoZW1hJztcbmltcG9ydCB7IFN0YXRlIGFzIEJ1aWxkZXJQcm9ncmVzc1N0YXRlLCBTY2hlbWEgYXMgUmVhbEJ1aWxkZXJQcm9ncmVzcyB9IGZyb20gJy4vcHJvZ3Jlc3Mtc2NoZW1hJztcblxuZXhwb3J0IHR5cGUgVGFyZ2V0ID0ganNvbi5Kc29uT2JqZWN0ICYgUmVhbFRhcmdldDtcbmV4cG9ydCB7IEJ1aWxkZXJQcm9ncmVzc1N0YXRlIH07XG5cbi8vIFR5cGUgc2hvcnQgaGFuZHMuXG5leHBvcnQgdHlwZSBCdWlsZGVyUmVnaXN0cnkgPSBSZWdpc3RyeTxqc29uLkpzb25PYmplY3QsIEJ1aWxkZXJJbnB1dCwgQnVpbGRlck91dHB1dD47XG5cbi8qKlxuICogQW4gQVBJIHR5cGVkIEJ1aWxkZXJQcm9ncmVzcy4gVGhlIGludGVyZmFjZSBnZW5lcmF0ZWQgZnJvbSB0aGUgc2NoZW1hIGlzIHRvbyBwZXJtaXNzaXZlLFxuICogc28gdGhpcyBBUEkgaXMgdGhlIG9uZSB3ZSBzaG93IGluIG91ciBBUEkuIFBsZWFzZSBub3RlIHRoYXQgbm90IGFsbCBmaWVsZHMgYXJlIGluIHRoZXJlOyB0aGlzXG4gKiBpcyBpbiBhZGRpdGlvbiB0byBmaWVsZHMgaW4gdGhlIHNjaGVtYS5cbiAqL1xuZXhwb3J0IHR5cGUgVHlwZWRCdWlsZGVyUHJvZ3Jlc3MgPVxuICB8IHsgc3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLlN0b3BwZWQgfVxuICB8IHsgc3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLkVycm9yOyBlcnJvcjoganNvbi5Kc29uVmFsdWUgfVxuICB8IHsgc3RhdGU6IEJ1aWxkZXJQcm9ncmVzc1N0YXRlLldhaXRpbmc7IHN0YXR1cz86IHN0cmluZyB9XG4gIHwgeyBzdGF0ZTogQnVpbGRlclByb2dyZXNzU3RhdGUuUnVubmluZzsgc3RhdHVzPzogc3RyaW5nOyBjdXJyZW50OiBudW1iZXI7IHRvdGFsPzogbnVtYmVyIH07XG5cbi8qKlxuICogRGVjbGFyYXRpb24gb2YgdGhvc2UgdHlwZXMgYXMgSnNvbk9iamVjdCBjb21wYXRpYmxlLiBKc29uT2JqZWN0IGlzIG5vdCBjb21wYXRpYmxlIHdpdGhcbiAqIG9wdGlvbmFsIG1lbWJlcnMsIHNvIHRob3NlIHdvdWxkbid0IGJlIGRpcmVjdGx5IGFzc2lnbmFibGUgdG8gb3VyIGludGVybmFsIEpzb24gdHlwaW5ncy5cbiAqIEZvcmNpbmcgdGhlIHR5cGUgdG8gYmUgYm90aCBhIEpzb25PYmplY3QgYW5kIHRoZSB0eXBlIGZyb20gdGhlIFNjaGVtYSB0ZWxscyBUeXBlc2NyaXB0IHRoZXlcbiAqIGFyZSBjb21wYXRpYmxlICh3aGljaCB0aGV5IGFyZSkuXG4gKiBUaGVzZSB0eXBlcyBzaG91bGQgYmUgdXNlZCBldmVyeXdoZXJlLlxuICovXG5leHBvcnQgdHlwZSBCdWlsZGVySW5wdXQgPSBqc29uLkpzb25PYmplY3QgJiBSZWFsQnVpbGRlcklucHV0O1xuZXhwb3J0IHR5cGUgQnVpbGRlck91dHB1dCA9IGpzb24uSnNvbk9iamVjdCAmIFJlYWxCdWlsZGVyT3V0cHV0O1xuZXhwb3J0IHR5cGUgQnVpbGRlclByb2dyZXNzID0ganNvbi5Kc29uT2JqZWN0ICYgUmVhbEJ1aWxkZXJQcm9ncmVzcyAmIFR5cGVkQnVpbGRlclByb2dyZXNzO1xuXG4vKipcbiAqIEEgcHJvZ3Jlc3MgcmVwb3J0IGlzIHdoYXQgdGhlIHRvb2xpbmcgd2lsbCByZWNlaXZlLiBJdCBjb250YWlucyB0aGUgYnVpbGRlciBpbmZvIGFuZCB0aGUgdGFyZ2V0LlxuICogQWx0aG91Z2ggdGhlc2UgYXJlIHNlcmlhbGl6YWJsZSwgdGhleSBhcmUgb25seSBleHBvc2VkIHRocm91Z2ggdGhlIHRvb2xpbmcgaW50ZXJmYWNlLCBub3QgdGhlXG4gKiBidWlsZGVyIGludGVyZmFjZS4gVGhlIHdhdGNoIGRvZyBzZW5kcyBCdWlsZGVyUHJvZ3Jlc3MgYW5kIHRoZSBCdWlsZGVyIGhhcyBhIHNldCBvZiBmdW5jdGlvbnNcbiAqIHRvIG1hbmFnZSB0aGUgc3RhdGUuXG4gKi9cbmV4cG9ydCB0eXBlIEJ1aWxkZXJQcm9ncmVzc1JlcG9ydCA9IEJ1aWxkZXJQcm9ncmVzcyAmIHtcbiAgdGFyZ2V0PzogVGFyZ2V0O1xuICBidWlsZGVyOiBCdWlsZGVySW5mbztcbn07XG5cbi8qKlxuICogQSBSdW4sIHdoaWNoIGlzIHdoYXQgaXMgcmV0dXJuZWQgYnkgc2NoZWR1bGVCdWlsZGVyIG9yIHNjaGVkdWxlVGFyZ2V0IGZ1bmN0aW9ucy4gVGhpcyBzaG91bGRcbiAqIGJlIHJlY29uc3RydWN0ZWQgYWNyb3NzIG1lbW9yeSBib3VuZGFyaWVzIChpdCdzIG5vdCBzZXJpYWxpemFibGUgYnV0IGFsbCBpbnRlcm5hbCBpbmZvcm1hdGlvblxuICogYXJlKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCdWlsZGVyUnVuIHtcbiAgLyoqXG4gICAqIFVuaXF1ZSBhbW9uZ3N0IHJ1bnMuIFRoaXMgaXMgdGhlIHNhbWUgSUQgYXMgdGhlIGNvbnRleHQgZ2VuZXJhdGVkIGZvciB0aGUgcnVuLiBJdCBjYW4gYmVcbiAgICogdXNlZCB0byBpZGVudGlmeSBtdWx0aXBsZSB1bmlxdWUgcnVucy4gVGhlcmUgaXMgbm8gZ3VhcmFudGVlIHRoYXQgYSBydW4gaXMgYSBzaW5nbGUgb3V0cHV0O1xuICAgKiBhIGJ1aWxkZXIgY2FuIHJlYnVpbGQgb24gaXRzIG93biBhbmQgd2lsbCBnZW5lcmF0ZSBtdWx0aXBsZSBvdXRwdXRzLlxuICAgKi9cbiAgaWQ6IG51bWJlcjtcblxuICAvKipcbiAgICogVGhlIGJ1aWxkZXIgaW5mb3JtYXRpb24uXG4gICAqL1xuICBpbmZvOiBCdWlsZGVySW5mbztcblxuICAvKipcbiAgICogVGhlIG5leHQgb3V0cHV0IGZyb20gYSBidWlsZGVyLiBUaGlzIGlzIHJlY29tbWVuZGVkIHdoZW4gc2NoZWR1bGluZyBhIGJ1aWxkZXIgYW5kIG9ubHkgYmVpbmdcbiAgICogaW50ZXJlc3RlZCBpbiB0aGUgcmVzdWx0IG9mIHRoYXQgc2luZ2xlIHJ1biwgbm90IG9mIGEgd2F0Y2gtbW9kZSBidWlsZGVyLlxuICAgKi9cbiAgcmVzdWx0OiBQcm9taXNlPEJ1aWxkZXJPdXRwdXQ+O1xuXG4gIC8qKlxuICAgKiBUaGUgb3V0cHV0KHMpIGZyb20gdGhlIGJ1aWxkZXIuIEEgYnVpbGRlciBjYW4gaGF2ZSBtdWx0aXBsZSBvdXRwdXRzLlxuICAgKiBUaGlzIGFsd2F5cyByZXBsYXkgdGhlIGxhc3Qgb3V0cHV0IHdoZW4gc3Vic2NyaWJlZC5cbiAgICovXG4gIG91dHB1dDogT2JzZXJ2YWJsZTxCdWlsZGVyT3V0cHV0PjtcblxuICAvKipcbiAgICogVGhlIHByb2dyZXNzIHJlcG9ydC4gQSBwcm9ncmVzcyBhbHNvIGNvbnRhaW5zIGFuIElELCB3aGljaCBjYW4gYmUgZGlmZmVyZW50IHRoYW4gdGhpcyBydW4nc1xuICAgKiBJRCAoaWYgdGhlIGJ1aWxkZXIgY2FsbHMgc2NoZWR1bGVCdWlsZGVyIG9yIHNjaGVkdWxlVGFyZ2V0KS5cbiAgICogVGhpcyB3aWxsIGFsd2F5cyByZXBsYXkgdGhlIGxhc3QgcHJvZ3Jlc3Mgb24gbmV3IHN1YnNjcmlwdGlvbnMuXG4gICAqL1xuICBwcm9ncmVzczogT2JzZXJ2YWJsZTxCdWlsZGVyUHJvZ3Jlc3NSZXBvcnQ+O1xuXG4gIC8qKlxuICAgKiBTdG9wIHRoZSBidWlsZGVyIGZyb20gcnVubmluZy4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBidWlsZGVyIGlzIHN0b3BwZWQuXG4gICAqIFNvbWUgYnVpbGRlcnMgbWlnaHQgbm90IGhhbmRsZSBzdG9wcGluZyBwcm9wZXJseSBhbmQgc2hvdWxkIGhhdmUgYSB0aW1lb3V0IGhlcmUuXG4gICAqL1xuICBzdG9wKCk6IFByb21pc2U8dm9pZD47XG59XG5cbi8qKlxuICogQWRkaXRpb25hbCBvcHRpb25hbCBzY2hlZHVsaW5nIG9wdGlvbnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2NoZWR1bGVPcHRpb25zIHtcbiAgLyoqXG4gICAqIExvZ2dlciB0byBwYXNzIHRvIHRoZSBidWlsZGVyLiBOb3RlIHRoYXQgbWVzc2FnZXMgd2lsbCBzdG9wIGJlaW5nIGZvcndhcmRlZCwgYW5kIGlmIHlvdSB3YW50XG4gICAqIHRvIGxvZyBhIGJ1aWxkZXIgc2NoZWR1bGVkIGZyb20geW91ciBidWlsZGVyIHlvdSBzaG91bGQgZm9yd2FyZCBsb2cgZXZlbnRzIHlvdXJzZWxmLlxuICAgKi9cbiAgbG9nZ2VyPzogbG9nZ2luZy5Mb2dnZXI7XG5cbiAgLyoqXG4gICAqIFRhcmdldCB0byBwYXNzIHRvIHRoZSBidWlsZGVyLlxuICAgKi9cbiAgdGFyZ2V0PzogVGFyZ2V0O1xufVxuXG4vKipcbiAqIFRoZSBjb250ZXh0IHJlY2VpdmVkIGFzIGEgc2Vjb25kIGFyZ3VtZW50IGluIHlvdXIgYnVpbGRlci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCdWlsZGVyQ29udGV4dCB7XG4gIC8qKlxuICAgKiBVbmlxdWUgYW1vbmdzdCBjb250ZXh0cy4gQ29udGV4dHMgaW5zdGFuY2VzIGFyZSBub3QgZ3VhcmFudGVlZCB0byBiZSB0aGUgc2FtZSAoYnV0IGl0IGNvdWxkXG4gICAqIGJlIHRoZSBzYW1lIGNvbnRleHQpLCBhbmQgYWxsIHRoZSBmaWVsZHMgaW4gYSBjb250ZXh0IGNvdWxkIGJlIHRoZSBzYW1lLCB5ZXQgdGhlIGJ1aWxkZXInc1xuICAgKiBjb250ZXh0IGNvdWxkIGJlIGRpZmZlcmVudC4gVGhpcyBpcyB0aGUgc2FtZSBJRCBhcyB0aGUgY29ycmVzcG9uZGluZyBydW4uXG4gICAqL1xuICBpZDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBUaGUgYnVpbGRlciBpbmZvIHRoYXQgY2FsbGVkIHlvdXIgZnVuY3Rpb24uIFNpbmNlIHRoZSBidWlsZGVyIGluZm8gaXMgZnJvbSB0aGUgYnVpbGRlci5qc29uXG4gICAqIChvciB0aGUgaG9zdCksIGl0IGNvdWxkIGNvbnRhaW4gaW5mb3JtYXRpb24gdGhhdCBpcyBkaWZmZXJlbnQgdGhhbiBleHBlY3RlZC5cbiAgICovXG4gIGJ1aWxkZXI6IEJ1aWxkZXJJbmZvO1xuXG4gIC8qKlxuICAgKiBBIGxvZ2dlciB0aGF0IGFwcGVuZHMgbWVzc2FnZXMgdG8gYSBsb2cuIFRoaXMgY291bGQgYmUgYSBzZXBhcmF0ZSBpbnRlcmZhY2Ugb3IgY29tcGxldGVseVxuICAgKiBpZ25vcmVkLiBgY29uc29sZS5sb2dgIGNvdWxkIGFsc28gYmUgY29tcGxldGVseSBpZ25vcmVkLlxuICAgKi9cbiAgbG9nZ2VyOiBsb2dnaW5nLkxvZ2dlckFwaTtcblxuICAvKipcbiAgICogVGhlIGFic29sdXRlIHdvcmtzcGFjZSByb290IG9mIHRoaXMgcnVuLiBUaGlzIGlzIGEgc3lzdGVtIHBhdGggYW5kIHdpbGwgbm90IGJlIG5vcm1hbGl6ZWQ7XG4gICAqIGllLiBvbiBXaW5kb3dzIGl0IHdpbGwgc3RhcnRzIHdpdGggYEM6XFxcXGAgKG9yIHdoYXRldmVyIGRyaXZlKS5cbiAgICovXG4gIHdvcmtzcGFjZVJvb3Q6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGN1cnJlbnQgZGlyZWN0b3J5IHRoZSB1c2VyIGlzIGluLiBUaGlzIGNvdWxkIGJlIG91dHNpZGUgdGhlIHdvcmtzcGFjZSByb290LiBUaGlzIGlzIGFcbiAgICogc3lzdGVtIHBhdGggYW5kIHdpbGwgbm90IGJlIG5vcm1hbGl6ZWQ7IGllLiBvbiBXaW5kb3dzIGl0IHdpbGwgc3RhcnRzIHdpdGggYEM6XFxcXGAgKG9yXG4gICAqIHdoYXRldmVyIGRyaXZlKS5cbiAgICovXG4gIGN1cnJlbnREaXJlY3Rvcnk6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIHRhcmdldCB0aGF0IHdhcyB1c2VkIHRvIHJ1biB0aGlzIGJ1aWxkZXIuXG4gICAqIFRhcmdldCBpcyBvcHRpb25hbCBpZiBhIGJ1aWxkZXIgd2FzIHJhbiB1c2luZyBgc2NoZWR1bGVCdWlsZGVyKClgLlxuICAgKi9cbiAgdGFyZ2V0PzogVGFyZ2V0O1xuXG4gIC8qKlxuICAgKiBTY2hlZHVsZSBhIHRhcmdldCBpbiB0aGUgc2FtZSB3b3Jrc3BhY2UuIFRoaXMgY2FuIGJlIHRoZSBzYW1lIHRhcmdldCB0aGF0IGlzIGJlaW5nIGV4ZWN1dGVkXG4gICAqIHJpZ2h0IG5vdywgYnV0IHRhcmdldHMgb2YgdGhlIHNhbWUgbmFtZSBhcmUgc2VyaWFsaXplZC5cbiAgICogUnVubmluZyB0aGUgc2FtZSB0YXJnZXQgYW5kIHdhaXRpbmcgZm9yIGl0IHRvIGVuZCB3aWxsIHJlc3VsdCBpbiBhIGRlYWRsb2NraW5nIHNjZW5hcmlvLlxuICAgKiBUYXJnZXRzIGFyZSBjb25zaWRlcmVkIHRoZSBzYW1lIGlmIHRoZSBwcm9qZWN0LCB0aGUgdGFyZ2V0IEFORCB0aGUgY29uZmlndXJhdGlvbiBhcmUgdGhlIHNhbWUuXG4gICAqIEBwYXJhbSB0YXJnZXQgVGhlIHRhcmdldCB0byBzY2hlZHVsZS5cbiAgICogQHBhcmFtIG92ZXJyaWRlcyBBIHNldCBvZiBvcHRpb25zIHRvIG92ZXJyaWRlIHRoZSB3b3Jrc3BhY2Ugc2V0IG9mIG9wdGlvbnMuXG4gICAqIEBwYXJhbSBzY2hlZHVsZU9wdGlvbnMgQWRkaXRpb25hbCBvcHRpb25hbCBzY2hlZHVsaW5nIG9wdGlvbnMuXG4gICAqIEByZXR1cm4gQSBwcm9taXNlIG9mIGEgcnVuLiBJdCB3aWxsIHJlc29sdmUgd2hlbiBhbGwgdGhlIG1lbWJlcnMgb2YgdGhlIHJ1biBhcmUgYXZhaWxhYmxlLlxuICAgKi9cbiAgc2NoZWR1bGVUYXJnZXQoXG4gICAgdGFyZ2V0OiBUYXJnZXQsXG4gICAgb3ZlcnJpZGVzPzoganNvbi5Kc29uT2JqZWN0LFxuICAgIHNjaGVkdWxlT3B0aW9ucz86IFNjaGVkdWxlT3B0aW9ucyxcbiAgKTogUHJvbWlzZTxCdWlsZGVyUnVuPjtcblxuICAvKipcbiAgICogU2NoZWR1bGUgYSBidWlsZGVyIGJ5IGl0cyBuYW1lLiBUaGlzIGNhbiBiZSB0aGUgc2FtZSBidWlsZGVyIHRoYXQgaXMgYmVpbmcgZXhlY3V0ZWQuXG4gICAqIEBwYXJhbSBidWlsZGVyTmFtZSBUaGUgbmFtZSBvZiB0aGUgYnVpbGRlciwgaWUuIGl0cyBgcGFja2FnZU5hbWU6YnVpbGRlck5hbWVgIHR1cGxlLlxuICAgKiBAcGFyYW0gb3B0aW9ucyBBbGwgb3B0aW9ucyB0byB1c2UgZm9yIHRoZSBidWlsZGVyIChieSBkZWZhdWx0IGVtcHR5IG9iamVjdCkuIFRoZXJlIGlzIG5vXG4gICAqICAgICBhZGRpdGlvbmFsIG9wdGlvbnMgYWRkZWQsIGUuZy4gZnJvbSB0aGUgd29ya3NwYWNlLlxuICAgKiBAcGFyYW0gc2NoZWR1bGVPcHRpb25zIEFkZGl0aW9uYWwgb3B0aW9uYWwgc2NoZWR1bGluZyBvcHRpb25zLlxuICAgKiBAcmV0dXJuIEEgcHJvbWlzZSBvZiBhIHJ1bi4gSXQgd2lsbCByZXNvbHZlIHdoZW4gYWxsIHRoZSBtZW1iZXJzIG9mIHRoZSBydW4gYXJlIGF2YWlsYWJsZS5cbiAgICovXG4gIHNjaGVkdWxlQnVpbGRlcihcbiAgICBidWlsZGVyTmFtZTogc3RyaW5nLFxuICAgIG9wdGlvbnM/OiBqc29uLkpzb25PYmplY3QsXG4gICAgc2NoZWR1bGVPcHRpb25zPzogU2NoZWR1bGVPcHRpb25zLFxuICApOiBQcm9taXNlPEJ1aWxkZXJSdW4+O1xuXG4gIC8qKlxuICAgKiBSZXNvbHZlIGFuZCByZXR1cm4gb3B0aW9ucyBmb3IgYSBzcGVjaWZpZWQgdGFyZ2V0LiBJZiB0aGUgdGFyZ2V0IGlzbid0IGRlZmluZWQgaW4gdGhlXG4gICAqIHdvcmtzcGFjZSB0aGlzIHdpbGwgcmVqZWN0IHRoZSBwcm9taXNlLiBUaGlzIG9iamVjdCB3aWxsIGJlIHJlYWQgZGlyZWN0bHkgZnJvbSB0aGUgd29ya3NwYWNlXG4gICAqIGJ1dCBub3QgdmFsaWRhdGVkIGFnYWluc3QgdGhlIGJ1aWxkZXIgb2YgdGhlIHRhcmdldC5cbiAgICogQHBhcmFtIHRhcmdldCBUaGUgdGFyZ2V0IHRvIHJlc29sdmUgdGhlIG9wdGlvbnMgb2YuXG4gICAqIEByZXR1cm4gQSBub24tdmFsaWRhdGVkIG9iamVjdCByZXNvbHZlZCBmcm9tIHRoZSB3b3Jrc3BhY2UuXG4gICAqL1xuICBnZXRUYXJnZXRPcHRpb25zKHRhcmdldDogVGFyZ2V0KTogUHJvbWlzZTxqc29uLkpzb25PYmplY3Q+O1xuXG4gIGdldFByb2plY3RNZXRhZGF0YShwcm9qZWN0TmFtZTogc3RyaW5nKTogUHJvbWlzZTxqc29uLkpzb25PYmplY3Q+O1xuICBnZXRQcm9qZWN0TWV0YWRhdGEodGFyZ2V0OiBUYXJnZXQpOiBQcm9taXNlPGpzb24uSnNvbk9iamVjdD47XG5cbiAgLyoqXG4gICAqIFJlc29sdmVzIGFuZCByZXR1cm4gYSBidWlsZGVyIG5hbWUuIFRoZSBleGFjdCBmb3JtYXQgb2YgdGhlIG5hbWUgaXMgdXAgdG8gdGhlIGhvc3QsXG4gICAqIHNvIGl0IHNob3VsZCBub3QgYmUgcGFyc2VkIHRvIGdhdGhlciBpbmZvcm1hdGlvbiAoaXQncyBmcmVlIGZvcm0pLiBUaGlzIHN0cmluZyBjYW4gYmVcbiAgICogdXNlZCB0byB2YWxpZGF0ZSBvcHRpb25zIG9yIHNjaGVkdWxlIGEgYnVpbGRlciBkaXJlY3RseS5cbiAgICogQHBhcmFtIHRhcmdldCBUaGUgdGFyZ2V0IHRvIHJlc29sdmUgdGhlIGJ1aWxkZXIgbmFtZS5cbiAgICovXG4gIGdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldDogVGFyZ2V0KTogUHJvbWlzZTxzdHJpbmc+O1xuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgdGhlIG9wdGlvbnMgYWdhaW5zdCBhIGJ1aWxkZXIgc2NoZW1hLiBUaGlzIHVzZXMgdGhlIHNhbWUgbWV0aG9kcyBhcyB0aGVcbiAgICogc2NoZWR1bGVUYXJnZXQgYW5kIHNjaGVkdWxlQnJvd3NlciBtZXRob2RzIHRvIHZhbGlkYXRlIGFuZCBhcHBseSBkZWZhdWx0cyB0byB0aGUgb3B0aW9ucy5cbiAgICogSXQgY2FuIGJlIGdlbmVyaWNhbGx5IHR5cGVkLCBpZiB5b3Uga25vdyB3aGljaCBpbnRlcmZhY2UgaXQgaXMgc3VwcG9zZWQgdG8gdmFsaWRhdGUgYWdhaW5zdC5cbiAgICogQHBhcmFtIG9wdGlvbnMgQSBnZW5lcmljIG9wdGlvbiBvYmplY3QgdG8gdmFsaWRhdGUuXG4gICAqIEBwYXJhbSBidWlsZGVyTmFtZSBUaGUgbmFtZSBvZiBhIGJ1aWxkZXIgdG8gdXNlLiBUaGlzIGNhbiBiZSBnb3R0ZW4gZm9yIGEgdGFyZ2V0IGJ5IHVzaW5nIHRoZVxuICAgKiAgICAgICAgICAgICAgICAgICAgZ2V0QnVpbGRlckZvclRhcmdldCgpIG1ldGhvZCBvbiB0aGUgY29udGV4dC5cbiAgICovXG4gIHZhbGlkYXRlT3B0aW9uczxUIGV4dGVuZHMganNvbi5Kc29uT2JqZWN0ID0ganNvbi5Kc29uT2JqZWN0PihcbiAgICBvcHRpb25zOiBqc29uLkpzb25PYmplY3QsXG4gICAgYnVpbGRlck5hbWU6IHN0cmluZyxcbiAgKTogUHJvbWlzZTxUPjtcblxuICAvKipcbiAgICogU2V0IHRoZSBidWlsZGVyIHRvIHJ1bm5pbmcuIFRoaXMgc2hvdWxkIGJlIHVzZWQgaWYgYW4gZXh0ZXJuYWwgZXZlbnQgdHJpZ2dlcmVkIGEgcmUtcnVuLFxuICAgKiBlLmcuIGEgZmlsZSB3YXRjaGVkIHdhcyBjaGFuZ2VkLlxuICAgKi9cbiAgcmVwb3J0UnVubmluZygpOiB2b2lkO1xuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIHN0YXR1cyBzdHJpbmcgc2hvd24gb24gdGhlIGludGVyZmFjZS5cbiAgICogQHBhcmFtIHN0YXR1cyBUaGUgc3RhdHVzIHRvIHNldCBpdCB0by4gQW4gZW1wdHkgc3RyaW5nIGNhbiBiZSB1c2VkIHRvIHJlbW92ZSB0aGUgc3RhdHVzLlxuICAgKi9cbiAgcmVwb3J0U3RhdHVzKHN0YXR1czogc3RyaW5nKTogdm9pZDtcblxuICAvKipcbiAgICogVXBkYXRlIHRoZSBwcm9ncmVzcyBmb3IgdGhpcyBidWlsZGVyIHJ1bi5cbiAgICogQHBhcmFtIGN1cnJlbnQgVGhlIGN1cnJlbnQgcHJvZ3Jlc3MuIFRoaXMgd2lsbCBiZSBiZXR3ZWVuIDAgYW5kIHRvdGFsLlxuICAgKiBAcGFyYW0gdG90YWwgQSBuZXcgdG90YWwgdG8gc2V0LiBCeSBkZWZhdWx0IGF0IHRoZSBzdGFydCBvZiBhIHJ1biB0aGlzIGlzIDEuIElmIG9taXR0ZWQgaXRcbiAgICogICAgIHdpbGwgdXNlIHRoZSBzYW1lIHZhbHVlIGFzIHRoZSBsYXN0IHRvdGFsLlxuICAgKiBAcGFyYW0gc3RhdHVzIFVwZGF0ZSB0aGUgc3RhdHVzIHN0cmluZy4gSWYgb21pdHRlZCB0aGUgc3RhdHVzIHN0cmluZyBpcyBub3QgbW9kaWZpZWQuXG4gICAqL1xuICByZXBvcnRQcm9ncmVzcyhjdXJyZW50OiBudW1iZXIsIHRvdGFsPzogbnVtYmVyLCBzdGF0dXM/OiBzdHJpbmcpOiB2b2lkO1xuXG4gIC8qKlxuICAgKiBBUEkgdG8gcmVwb3J0IGFuYWx5dGljcy4gVGhpcyBtaWdodCBiZSB1bmRlZmluZWQgaWYgdGhlIGZlYXR1cmUgaXMgdW5zdXBwb3J0ZWQuIFRoaXMgbWlnaHRcbiAgICogbm90IGJlIHVuZGVmaW5lZCwgYnV0IHRoZSBiYWNrZW5kIGNvdWxkIGFsc28gbm90IHJlcG9ydCBhbnl0aGluZy5cbiAgICovXG4gIHJlYWRvbmx5IGFuYWx5dGljczogYW5hbHl0aWNzLkFuYWx5dGljcztcblxuICAvKipcbiAgICogQWRkIHRlYXJkb3duIGxvZ2ljIHRvIHRoaXMgQ29udGV4dCwgc28gdGhhdCB3aGVuIGl0J3MgYmVpbmcgc3RvcHBlZCBpdCB3aWxsIGV4ZWN1dGUgdGVhcmRvd24uXG4gICAqL1xuICBhZGRUZWFyZG93bih0ZWFyZG93bjogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQpOiB2b2lkO1xufVxuXG4vKipcbiAqIEFuIGFjY2VwdGVkIHJldHVybiB2YWx1ZSBmcm9tIGEgYnVpbGRlci4gQ2FuIGJlIGVpdGhlciBhbiBPYnNlcnZhYmxlLCBhIFByb21pc2Ugb3IgYSB2ZWN0b3IuXG4gKi9cbmV4cG9ydCB0eXBlIEJ1aWxkZXJPdXRwdXRMaWtlID1cbiAgfCBBc3luY0l0ZXJhYmxlPEJ1aWxkZXJPdXRwdXQ+XG4gIHwgU3Vic2NyaWJhYmxlT3JQcm9taXNlPEJ1aWxkZXJPdXRwdXQ+XG4gIHwgQnVpbGRlck91dHB1dDtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmV4cG9ydCBmdW5jdGlvbiBpc0J1aWxkZXJPdXRwdXQob2JqOiBhbnkpOiBvYmogaXMgQnVpbGRlck91dHB1dCB7XG4gIGlmICghb2JqIHx8IHR5cGVvZiBvYmoudGhlbiA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2Ygb2JqLnN1YnNjcmliZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0eXBlb2Ygb2JqLnN1Y2Nlc3MgPT09ICdib29sZWFuJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZyb21Bc3luY0l0ZXJhYmxlPFQ+KGl0ZXJhYmxlOiBBc3luY0l0ZXJhYmxlPFQ+KTogT2JzZXJ2YWJsZTxUPiB7XG4gIHJldHVybiBuZXcgT2JzZXJ2YWJsZSgoc3Vic2NyaWJlcikgPT4ge1xuICAgIGhhbmRsZUFzeW5jSXRlcmF0b3Ioc3Vic2NyaWJlciwgaXRlcmFibGVbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCkpLnRoZW4oXG4gICAgICAoKSA9PiBzdWJzY3JpYmVyLmNvbXBsZXRlKCksXG4gICAgICAoZXJyb3IpID0+IHN1YnNjcmliZXIuZXJyb3IoZXJyb3IpLFxuICAgICk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVBc3luY0l0ZXJhdG9yPFQ+KFxuICBzdWJzY3JpYmVyOiBTdWJzY3JpYmVyPFQ+LFxuICBpdGVyYXRvcjogQXN5bmNJdGVyYXRvcjxUPixcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB0ZWFyZG93biA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiBzdWJzY3JpYmVyLmFkZCgoKSA9PiByZXNvbHZlKCkpKTtcblxuICB0cnkge1xuICAgIHdoaWxlICghc3Vic2NyaWJlci5jbG9zZWQpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UucmFjZShbdGVhcmRvd24sIGl0ZXJhdG9yLm5leHQoKV0pO1xuICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LmRvbmUpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHN1YnNjcmliZXIubmV4dChyZXN1bHQudmFsdWUpO1xuICAgIH1cbiAgfSBmaW5hbGx5IHtcbiAgICBhd2FpdCBpdGVyYXRvci5yZXR1cm4/LigpO1xuICB9XG59XG5cbi8qKlxuICogQSBidWlsZGVyIGhhbmRsZXIgZnVuY3Rpb24uIFRoZSBmdW5jdGlvbiBzaWduYXR1cmUgcGFzc2VkIHRvIGBjcmVhdGVCdWlsZGVyKClgLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkZXJIYW5kbGVyRm48QT4ge1xuICAvKipcbiAgICogQnVpbGRlcnMgYXJlIGRlZmluZWQgYnkgdXNlcnMgdG8gcGVyZm9ybSBhbnkga2luZCBvZiB0YXNrLCBsaWtlIGJ1aWxkaW5nLCB0ZXN0aW5nIG9yIGxpbnRpbmcsXG4gICAqIGFuZCBzaG91bGQgdXNlIHRoaXMgaW50ZXJmYWNlLlxuICAgKiBAcGFyYW0gaW5wdXQgVGhlIG9wdGlvbnMgKGEgSnNvbk9iamVjdCksIHZhbGlkYXRlZCBieSB0aGUgc2NoZW1hIGFuZCByZWNlaXZlZCBieSB0aGVcbiAgICogICAgIGJ1aWxkZXIuIFRoaXMgY2FuIGluY2x1ZGUgcmVzb2x2ZWQgb3B0aW9ucyBmcm9tIHRoZSBDTEkgb3IgdGhlIHdvcmtzcGFjZS5cbiAgICogQHBhcmFtIGNvbnRleHQgQSBjb250ZXh0IHRoYXQgY2FuIGJlIHVzZWQgdG8gaW50ZXJhY3Qgd2l0aCB0aGUgQXJjaGl0ZWN0IGZyYW1ld29yay5cbiAgICogQHJldHVybiBPbmUgb3IgbWFueSBidWlsZGVyIG91dHB1dC5cbiAgICovXG4gIChpbnB1dDogQSwgY29udGV4dDogQnVpbGRlckNvbnRleHQpOiBCdWlsZGVyT3V0cHV0TGlrZTtcbn1cblxuLyoqXG4gKiBBIEJ1aWxkZXIgZ2VuZXJhbCBpbmZvcm1hdGlvbi4gVGhpcyBpcyBnZW5lcmF0ZWQgYnkgdGhlIGhvc3QgYW5kIGlzIGV4cGFuZGVkIGJ5IHRoZSBob3N0LCBidXRcbiAqIHRoZSBwdWJsaWMgQVBJIGNvbnRhaW5zIHRob3NlIGZpZWxkcy5cbiAqL1xuZXhwb3J0IHR5cGUgQnVpbGRlckluZm8gPSBqc29uLkpzb25PYmplY3QgJiB7XG4gIGJ1aWxkZXJOYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIG9wdGlvblNjaGVtYToganNvbi5zY2hlbWEuSnNvblNjaGVtYTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyBvZiBcInByb2plY3Q6dGFyZ2V0Wzpjb25maWd1cmF0aW9uXVwiIGZvciB0aGUgdGFyZ2V0IG9iamVjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRhcmdldFN0cmluZ0Zyb21UYXJnZXQoeyBwcm9qZWN0LCB0YXJnZXQsIGNvbmZpZ3VyYXRpb24gfTogVGFyZ2V0KSB7XG4gIHJldHVybiBgJHtwcm9qZWN0fToke3RhcmdldH0ke2NvbmZpZ3VyYXRpb24gIT09IHVuZGVmaW5lZCA/ICc6JyArIGNvbmZpZ3VyYXRpb24gOiAnJ31gO1xufVxuXG4vKipcbiAqIFJldHVybiBhIFRhcmdldCB0dXBsZSBmcm9tIGEgc3RyaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdGFyZ2V0RnJvbVRhcmdldFN0cmluZyhzdHI6IHN0cmluZyk6IFRhcmdldCB7XG4gIGNvbnN0IHR1cGxlID0gc3RyLnNwbGl0KC86LywgMyk7XG4gIGlmICh0dXBsZS5sZW5ndGggPCAyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRhcmdldCBzdHJpbmc6ICcgKyBKU09OLnN0cmluZ2lmeShzdHIpKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcHJvamVjdDogdHVwbGVbMF0sXG4gICAgdGFyZ2V0OiB0dXBsZVsxXSxcbiAgICAuLi4odHVwbGVbMl0gIT09IHVuZGVmaW5lZCAmJiB7IGNvbmZpZ3VyYXRpb246IHR1cGxlWzJdIH0pLFxuICB9O1xufVxuXG4vKipcbiAqIFNjaGVkdWxlIGEgdGFyZ2V0LCBhbmQgZm9yZ2V0IGFib3V0IGl0cyBydW4uIFRoaXMgd2lsbCByZXR1cm4gYW4gb2JzZXJ2YWJsZSBvZiBvdXRwdXRzLCB0aGF0XG4gKiBhcyBhIGEgdGVhcmRvd24gd2lsbCBzdG9wIHRoZSB0YXJnZXQgZnJvbSBydW5uaW5nLiBUaGlzIG1lYW5zIHRoYXQgdGhlIFJ1biBvYmplY3QgdGhpcyByZXR1cm5zXG4gKiBzaG91bGQgbm90IGJlIHNoYXJlZC5cbiAqXG4gKiBUaGUgcmVhc29uIHRoaXMgaXMgbm90IHBhcnQgb2YgdGhlIENvbnRleHQgaW50ZXJmYWNlIGlzIHRvIGtlZXAgdGhlIENvbnRleHQgYXMgbm9ybWFsIGZvcm0gYXNcbiAqIHBvc3NpYmxlLiBUaGlzIGlzIHJlYWxseSBhbiB1dGlsaXR5IHRoYXQgcGVvcGxlIHdvdWxkIGltcGxlbWVudCBpbiB0aGVpciBwcm9qZWN0LlxuICpcbiAqIEBwYXJhbSBjb250ZXh0IFRoZSBjb250ZXh0IG9mIHlvdXIgY3VycmVudCBleGVjdXRpb24uXG4gKiBAcGFyYW0gdGFyZ2V0IFRoZSB0YXJnZXQgdG8gc2NoZWR1bGUuXG4gKiBAcGFyYW0gb3ZlcnJpZGVzIE92ZXJyaWRlcyB0aGF0IGFyZSB1c2VkIGluIHRoZSB0YXJnZXQuXG4gKiBAcGFyYW0gc2NoZWR1bGVPcHRpb25zIEFkZGl0aW9uYWwgc2NoZWR1bGluZyBvcHRpb25zLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2NoZWR1bGVUYXJnZXRBbmRGb3JnZXQoXG4gIGNvbnRleHQ6IEJ1aWxkZXJDb250ZXh0LFxuICB0YXJnZXQ6IFRhcmdldCxcbiAgb3ZlcnJpZGVzPzoganNvbi5Kc29uT2JqZWN0LFxuICBzY2hlZHVsZU9wdGlvbnM/OiBTY2hlZHVsZU9wdGlvbnMsXG4pOiBPYnNlcnZhYmxlPEJ1aWxkZXJPdXRwdXQ+IHtcbiAgbGV0IHJlc29sdmU6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHIpID0+IChyZXNvbHZlID0gcikpO1xuICBjb250ZXh0LmFkZFRlYXJkb3duKCgpID0+IHByb21pc2UpO1xuXG4gIHJldHVybiBmcm9tKGNvbnRleHQuc2NoZWR1bGVUYXJnZXQodGFyZ2V0LCBvdmVycmlkZXMsIHNjaGVkdWxlT3B0aW9ucykpLnBpcGUoXG4gICAgc3dpdGNoTWFwKFxuICAgICAgKHJ1bikgPT5cbiAgICAgICAgbmV3IE9ic2VydmFibGU8QnVpbGRlck91dHB1dD4oKG9ic2VydmVyKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gcnVuLm91dHB1dC5zdWJzY3JpYmUob2JzZXJ2ZXIpO1xuXG4gICAgICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xuICAgICAgICAgICAgLy8gV2UgY2FuIHByb3Blcmx5IGlnbm9yZSB0aGUgZmxvYXRpbmcgcHJvbWlzZSBhcyBpdCdzIGEgXCJyZXZlcnNlXCIgcHJvbWlzZTsgdGhlIHRlYXJkb3duXG4gICAgICAgICAgICAvLyBpcyB3YWl0aW5nIGZvciB0aGUgcmVzb2x2ZS5cbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZmxvYXRpbmctcHJvbWlzZXNcbiAgICAgICAgICAgIHJ1bi5zdG9wKCkudGhlbihyZXNvbHZlKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9KSxcbiAgICApLFxuICApO1xufVxuIl19