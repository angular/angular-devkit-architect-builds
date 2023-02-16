"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoggerJob = exports.createJobFactory = exports.createJobHandler = exports.ChannelAlreadyExistException = void 0;
const core_1 = require("@angular-devkit/core");
const rxjs_1 = require("rxjs");
const api_1 = require("./api");
class ChannelAlreadyExistException extends core_1.BaseException {
    constructor(name) {
        super(`Channel ${JSON.stringify(name)} already exist.`);
    }
}
exports.ChannelAlreadyExistException = ChannelAlreadyExistException;
/**
 * Make a simple job handler that sets start and end from a function that's synchronous.
 *
 * @param fn The function to create a handler for.
 * @param options An optional set of properties to set on the handler. Some fields might be
 *   required by registry or schedulers.
 */
function createJobHandler(fn, options = {}) {
    const handler = (argument, context) => {
        const description = context.description;
        const inboundBus = context.inboundBus;
        const inputChannel = new rxjs_1.Subject();
        let subscription;
        return new rxjs_1.Observable((subject) => {
            function complete() {
                if (subscription) {
                    subscription.unsubscribe();
                }
                subject.next({ kind: api_1.JobOutboundMessageKind.End, description });
                subject.complete();
                inputChannel.complete();
            }
            // Handle input.
            const inboundSub = inboundBus.subscribe((message) => {
                switch (message.kind) {
                    case api_1.JobInboundMessageKind.Ping:
                        subject.next({ kind: api_1.JobOutboundMessageKind.Pong, description, id: message.id });
                        break;
                    case api_1.JobInboundMessageKind.Stop:
                        // There's no way to cancel a promise or a synchronous function, but we do cancel
                        // observables where possible.
                        complete();
                        break;
                    case api_1.JobInboundMessageKind.Input:
                        inputChannel.next(message.value);
                        break;
                }
            });
            // Execute the function with the additional context.
            const channels = new Map();
            const newContext = {
                ...context,
                input: inputChannel.asObservable(),
                createChannel(name) {
                    if (channels.has(name)) {
                        throw new ChannelAlreadyExistException(name);
                    }
                    const channelSubject = new rxjs_1.Subject();
                    const channelSub = channelSubject.subscribe((message) => {
                        subject.next({
                            kind: api_1.JobOutboundMessageKind.ChannelMessage,
                            description,
                            name,
                            message,
                        });
                    }, (error) => {
                        subject.next({ kind: api_1.JobOutboundMessageKind.ChannelError, description, name, error });
                        // This can be reopened.
                        channels.delete(name);
                    }, () => {
                        subject.next({ kind: api_1.JobOutboundMessageKind.ChannelComplete, description, name });
                        // This can be reopened.
                        channels.delete(name);
                    });
                    channels.set(name, channelSubject);
                    if (subscription) {
                        subscription.add(channelSub);
                    }
                    return channelSubject;
                },
            };
            subject.next({ kind: api_1.JobOutboundMessageKind.Start, description });
            let result = fn(argument, newContext);
            // If the result is a promise, simply wait for it to complete before reporting the result.
            if ((0, core_1.isPromise)(result)) {
                result = (0, rxjs_1.from)(result);
            }
            else if (!(0, rxjs_1.isObservable)(result)) {
                result = (0, rxjs_1.of)(result);
            }
            subscription = result.subscribe((value) => subject.next({ kind: api_1.JobOutboundMessageKind.Output, description, value }), (error) => subject.error(error), () => complete());
            subscription.add(inboundSub);
            return subscription;
        });
    };
    return Object.assign(handler, { jobDescription: options });
}
exports.createJobHandler = createJobHandler;
/**
 * Lazily create a job using a function.
 * @param loader A factory function that returns a promise/observable of a JobHandler.
 * @param options Same options as createJob.
 */
function createJobFactory(loader, options = {}) {
    const handler = (argument, context) => {
        return (0, rxjs_1.from)(loader()).pipe((0, rxjs_1.switchMap)((fn) => fn(argument, context)));
    };
    return Object.assign(handler, { jobDescription: options });
}
exports.createJobFactory = createJobFactory;
/**
 * Creates a job that logs out input/output messages of another Job. The messages are still
 * propagated to the other job.
 */
function createLoggerJob(job, logger) {
    const handler = (argument, context) => {
        context.inboundBus
            .pipe((0, rxjs_1.tap)((message) => logger.info(`Input: ${JSON.stringify(message)}`)))
            .subscribe();
        return job(argument, context).pipe((0, rxjs_1.tap)((message) => logger.info(`Message: ${JSON.stringify(message)}`), (error) => logger.warn(`Error: ${JSON.stringify(error)}`), () => logger.info(`Completed`)));
    };
    return Object.assign(handler, job);
}
exports.createLoggerJob = createLoggerJob;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWpvYi1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L3NyYy9qb2JzL2NyZWF0ZS1qb2ItaGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7QUFFSCwrQ0FBb0Y7QUFDcEYsK0JBVWM7QUFDZCwrQkFPZTtBQUVmLE1BQWEsNEJBQTZCLFNBQVEsb0JBQWE7SUFDN0QsWUFBWSxJQUFZO1FBQ3RCLEtBQUssQ0FBQyxXQUFXLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDMUQsQ0FBQztDQUNGO0FBSkQsb0VBSUM7QUF5QkQ7Ozs7OztHQU1HO0FBQ0gsU0FBZ0IsZ0JBQWdCLENBQzlCLEVBQStCLEVBQy9CLFVBQW1DLEVBQUU7SUFFckMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxRQUFXLEVBQUUsT0FBbUMsRUFBRSxFQUFFO1FBQ25FLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUM7UUFDeEMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQztRQUN0QyxNQUFNLFlBQVksR0FBRyxJQUFJLGNBQU8sRUFBSyxDQUFDO1FBQ3RDLElBQUksWUFBMEIsQ0FBQztRQUUvQixPQUFPLElBQUksaUJBQVUsQ0FBd0IsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUN2RCxTQUFTLFFBQVE7Z0JBQ2YsSUFBSSxZQUFZLEVBQUU7b0JBQ2hCLFlBQVksQ0FBQyxXQUFXLEVBQUUsQ0FBQztpQkFDNUI7Z0JBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSw0QkFBc0IsQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztnQkFDaEUsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNuQixZQUFZLENBQUMsUUFBUSxF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d0IsRUFDeEIsTUFBeUI7SUFFekIsTUFBTSxPQUFPLEdBQUcsQ0FBQyxRQUFXLEVBQUUsT0FBbUMsRUFBRSxFQUFFO1FBQ25FLE9BQU8sQ0FBQyxVQUFVO2FBQ2YsSUFBSSxDQUFDLElBQUEsVUFBRyxFQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUN4RSxTQUFTLEVBQUUsQ0FBQztRQUVmLE9BQU8sR0FBRyxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQ2hDLElBQUEsVUFBRyxFQUNELENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQy9ELENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQ3pELEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQy9CLENBQ0YsQ0FBQztJQUNKLENBQUMsQ0FBQztJQUVGLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDckMsQ0FBQztBQW5CRCwwQ0FtQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgQmFzZUV4Y2VwdGlvbiwgSnNvblZhbHVlLCBpc1Byb21pc2UsIGxvZ2dpbmcgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQge1xuICBPYnNlcnZhYmxlLFxuICBPYnNlcnZlcixcbiAgU3ViamVjdCxcbiAgU3Vic2NyaXB0aW9uLFxuICBmcm9tLFxuICBpc09ic2VydmFibGUsXG4gIG9mLFxuICBzd2l0Y2hNYXAsXG4gIHRhcCxcbn0gZnJvbSAncnhqcyc7XG5pbXBvcnQge1xuICBKb2JEZXNjcmlwdGlvbixcbiAgSm9iSGFuZGxlcixcbiAgSm9iSGFuZGxlckNvbnRleHQsXG4gIEpvYkluYm91bmRNZXNzYWdlS2luZCxcbiAgSm9iT3V0Ym91bmRNZXNzYWdlLFxuICBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLFxufSBmcm9tICcuL2FwaSc7XG5cbmV4cG9ydCBjbGFzcyBDaGFubmVsQWxyZWFkeUV4aXN0RXhjZXB0aW9uIGV4dGVuZHMgQmFzZUV4Y2VwdGlvbiB7XG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZykge1xuICAgIHN1cGVyKGBDaGFubmVsICR7SlNPTi5zdHJpbmdpZnkobmFtZSl9IGFscmVhZHkgZXhpc3QuYCk7XG4gIH1cbn1cblxuLyoqXG4gKiBJbnRlcmZhY2UgZm9yIHRoZSBKb2JIYW5kbGVyIGNvbnRleHQgdGhhdCBpcyB1c2VkIHdoZW4gdXNpbmcgYGNyZWF0ZUpvYkhhbmRsZXIoKWAuIEl0IGV4dGVuZHNcbiAqIHRoZSBiYXNpYyBgSm9iSGFuZGxlckNvbnRleHRgIHdpdGggYWRkaXRpb25hbCBmdW5jdGlvbmFsaXR5LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNpbXBsZUpvYkhhbmRsZXJDb250ZXh0PFxuICBBIGV4dGVuZHMgSnNvblZhbHVlLFxuICBJIGV4dGVuZHMgSnNvblZhbHVlLFxuICBPIGV4dGVuZHMgSnNvblZhbHVlLFxuPiBleHRlbmRzIEpvYkhhbmRsZXJDb250ZXh0PEEsIEksIE8+IHtcbiAgY3JlYXRlQ2hhbm5lbDogKG5hbWU6IHN0cmluZykgPT4gT2JzZXJ2ZXI8SnNvblZhbHVlPjtcbiAgaW5wdXQ6IE9ic2VydmFibGU8ST47XG59XG5cbi8qKlxuICogQSBzaW1wbGUgdmVyc2lvbiBvZiB0aGUgSm9iSGFuZGxlci4gVGhpcyBzaW1wbGlmaWVzIGEgbG90IG9mIHRoZSBpbnRlcmFjdGlvbiB3aXRoIHRoZSBqb2JcbiAqIHNjaGVkdWxlciBhbmQgcmVnaXN0cnkuIEZvciBleGFtcGxlLCBpbnN0ZWFkIG9mIHJldHVybmluZyBhIEpvYk91dGJvdW5kTWVzc2FnZSBvYnNlcnZhYmxlLCB5b3VcbiAqIGNhbiBkaXJlY3RseSByZXR1cm4gYW4gb3V0cHV0LlxuICovXG5leHBvcnQgdHlwZSBTaW1wbGVKb2JIYW5kbGVyRm48QSBleHRlbmRzIEpzb25WYWx1ZSwgSSBleHRlbmRzIEpzb25WYWx1ZSwgTyBleHRlbmRzIEpzb25WYWx1ZT4gPSAoXG4gIGlucHV0OiBBLFxuICBjb250ZXh0OiBTaW1wbGVKb2JIYW5kbGVyQ29udGV4dDxBLCBJLCBPPixcbikgPT4gTyB8IFByb21pc2U8Tz4gfCBPYnNlcnZhYmxlPE8+O1xuXG4vKipcbiAqIE1ha2UgYSBzaW1wbGUgam9iIGhhbmRsZXIgdGhhdCBzZXRzIHN0YXJ0IGFuZCBlbmQgZnJvbSBhIGZ1bmN0aW9uIHRoYXQncyBzeW5jaHJvbm91cy5cbiAqXG4gKiBAcGFyYW0gZm4gVGhlIGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIGhhbmRsZXIgZm9yLlxuICogQHBhcmFtIG9wdGlvbnMgQW4gb3B0aW9uYWwgc2V0IG9mIHByb3BlcnRpZXMgdG8gc2V0IG9uIHRoZSBoYW5kbGVyLiBTb21lIGZpZWxkcyBtaWdodCBiZVxuICogICByZXF1aXJlZCBieSByZWdpc3RyeSBvciBzY2hlZHVsZXJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSm9iSGFuZGxlcjxBIGV4dGVuZHMgSnNvblZhbHVlLCBJIGV4dGVuZHMgSnNvblZhbHVlLCBPIGV4dGVuZHMgSnNvblZhbHVlPihcbiAgZm46IFNpbXBsZUpvYkhhbmRsZXJGbjxBLCBJLCBPPixcbiAgb3B0aW9uczogUGFydGlhbDxKb2JEZXNjcmlwdGlvbj4gPSB7fSxcbik6IEpvYkhhbmRsZXI8QSwgSSwgTz4ge1xuICBjb25zdCBoYW5kbGVyID0gKGFyZ3VtZW50OiBBLCBjb250ZXh0OiBKb2JIYW5kbGVyQ29udGV4dDxBLCBJLCBPPikgPT4ge1xuICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gY29udGV4dC5kZXNjcmlwdGlvbjtcbiAgICBjb25zdCBpbmJvdW5kQnVzID0gY29udGV4dC5pbmJvdW5kQnVzO1xuICAgIGNvbnN0IGlucHV0Q2hhbm5lbCA9IG5ldyBTdWJqZWN0PEk+KCk7XG4gICAgbGV0IHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uO1xuXG4gICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPEpvYk91dGJvdW5kTWVzc2FnZTxPPj4oKHN1YmplY3QpID0+IHtcbiAgICAgIGZ1bmN0aW9uIGNvbXBsZXRlKCkge1xuICAgICAgICBpZiAoc3Vic2NyaXB0aW9uKSB7XG4gICAgICAgICAgc3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XG4gICAgICAgIH1cbiAgICAgICAgc3ViamVjdC5uZXh0KHsga2luZDogSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5FbmQsIGRlc2NyaXB0aW9uIH0pO1xuICAgICAgICBzdWJqZWN0LmNvbXBsZXRlKCk7XG4gICAgICAgIGlucHV0Q2hhbm5lbC5jb21wbGV0ZSgpO1xuICAgICAgfVxuXG4gICAgICAvLyBIYW5kbGUgaW5wdXQuXG4gICAgICBjb25zdCBpbmJvdW5kU3ViID0gaW5ib3VuZEJ1cy5zdWJzY3JpYmUoKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgc3dpdGNoIChtZXNzYWdlLmtpbmQpIHtcbiAgICAgICAgICBjYXNlIEpvYkluYm91bmRNZXNzYWdlS2luZC5QaW5nOlxuICAgICAgICAgICAgc3ViamVjdC5uZXh0KHsga2luZDogSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5Qb25nLCBkZXNjcmlwdGlvbiwgaWQ6IG1lc3NhZ2UuaWQgfSk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIGNhc2UgSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLlN0b3A6XG4gICAgICAgICAgICAvLyBUaGVyZSdzIG5vIHdheSB0byBjYW5jZWwgYSBwcm9taXNlIG9yIGEgc3luY2hyb25vdXMgZnVuY3Rpb24sIGJ1dCB3ZSBkbyBjYW5jZWxcbiAgICAgICAgICAgIC8vIG9ic2VydmFibGVzIHdoZXJlIHBvc3NpYmxlLlxuICAgICAgICAgICAgY29tcGxldGUoKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgY2FzZSBKb2JJbmJvdW5kTWVzc2FnZUtpbmQuSW5wdXQ6XG4gICAgICAgICAgICBpbnB1dENoYW5uZWwubmV4dChtZXNzYWdlLnZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gRXhlY3V0ZSB0aGUgZnVuY3Rpb24gd2l0aCB0aGUgYWRkaXRpb25hbCBjb250ZXh0LlxuICAgICAgY29uc3QgY2hhbm5lbHMgPSBuZXcgTWFwPHN0cmluZywgU3ViamVjdDxKc29uVmFsdWU+PigpO1xuXG4gICAgICBjb25zdCBuZXdDb250ZXh0OiBTaW1wbGVKb2JIYW5kbGVyQ29udGV4dDxBLCBJLCBPPiA9IHtcbiAgICAgICAgLi4uY29udGV4dCxcbiAgICAgICAgaW5wdXQ6IGlucHV0Q2hhbm5lbC5hc09ic2VydmFibGUoKSxcbiAgICAgICAgY3JlYXRlQ2hhbm5lbChuYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgICBpZiAoY2hhbm5lbHMuaGFzKG5hbWUpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgQ2hhbm5lbEFscmVhZHlFeGlzdEV4Y2VwdGlvbihuYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgY2hhbm5lbFN1YmplY3QgPSBuZXcgU3ViamVjdDxKc29uVmFsdWU+KCk7XG4gICAgICAgICAgY29uc3QgY2hhbm5lbFN1YiA9IGNoYW5uZWxTdWJqZWN0LnN1YnNjcmliZShcbiAgICAgICAgICAgIChtZXNzYWdlKSA9PiB7XG4gICAgICAgICAgICAgIHN1YmplY3QubmV4dCh7XG4gICAgICAgICAgICAgICAga2luZDogSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5DaGFubmVsTWVzc2FnZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICBzdWJqZWN0Lm5leHQoeyBraW5kOiBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLkNoYW5uZWxFcnJvciwgZGVzY3JpcHRpb24sIG5hbWUsIGVycm9yIH0pO1xuICAgICAgICAgICAgICAvLyBUaGlzIGNhbiBiZSByZW9wZW5lZC5cbiAgICAgICAgICAgICAgY2hhbm5lbHMuZGVsZXRlKG5hbWUpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICAgc3ViamVjdC5uZXh0KHsga2luZDogSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5DaGFubmVsQ29tcGxldGUsIGRlc2NyaXB0aW9uLCBuYW1lIH0pO1xuICAgICAgICAgICAgICAvLyBUaGlzIGNhbiBiZSByZW9wZW5lZC5cbiAgICAgICAgICAgICAgY2hhbm5lbHMuZGVsZXRlKG5hbWUpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY2hhbm5lbHMuc2V0KG5hbWUsIGNoYW5uZWxTdWJqZWN0KTtcbiAgICAgICAgICBpZiAoc3Vic2NyaXB0aW9uKSB7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb24uYWRkKGNoYW5uZWxTdWIpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBjaGFubmVsU3ViamVjdDtcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIHN1YmplY3QubmV4dCh7IGtpbmQ6IEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuU3RhcnQsIGRlc2NyaXB0aW9uIH0pO1xuICAgICAgbGV0IHJlc3VsdCA9IGZuKGFyZ3VtZW50LCBuZXdDb250ZXh0KTtcbiAgICAgIC8vIElmIHRoZSByZXN1bHQgaXMgYSBwcm9taXNlLCBzaW1wbHkgd2FpdCBmb3IgaXQgdG8gY29tcGxldGUgYmVmb3JlIHJlcG9ydGluZyB0aGUgcmVzdWx0LlxuICAgICAgaWYgKGlzUHJvbWlzZShyZXN1bHQpKSB7XG4gICAgICAgIHJlc3VsdCA9IGZyb20ocmVzdWx0KTtcbiAgICAgIH0gZWxzZSBpZiAoIWlzT2JzZXJ2YWJsZShyZXN1bHQpKSB7XG4gICAgICAgIHJlc3VsdCA9IG9mKHJlc3VsdCBhcyBPKTtcbiAgICAgIH1cblxuICAgICAgc3Vic2NyaXB0aW9uID0gKHJlc3VsdCBhcyBPYnNlcnZhYmxlPE8+KS5zdWJzY3JpYmUoXG4gICAgICAgICh2YWx1ZTogTykgPT4gc3ViamVjdC5uZXh0KHsga2luZDogSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5PdXRwdXQsIGRlc2NyaXB0aW9uLCB2YWx1ZSB9KSxcbiAgICAgICAgKGVycm9yKSA9PiBzdWJqZWN0LmVycm9yKGVycm9yKSxcbiAgICAgICAgKCkgPT4gY29tcGxldGUoKSxcbiAgICAgICk7XG4gICAgICBzdWJzY3JpcHRpb24uYWRkKGluYm91bmRTdWIpO1xuXG4gICAgICByZXR1cm4gc3Vic2NyaXB0aW9uO1xuICAgIH0pO1xuICB9O1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKGhhbmRsZXIsIHsgam9iRGVzY3JpcHRpb246IG9wdGlvbnMgfSk7XG59XG5cbi8qKlxuICogTGF6aWx5IGNyZWF0ZSBhIGpvYiB1c2luZyBhIGZ1bmN0aW9uLlxuICogQHBhcmFtIGxvYWRlciBBIGZhY3RvcnkgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGEgcHJvbWlzZS9vYnNlcnZhYmxlIG9mIGEgSm9iSGFuZGxlci5cbiAqIEBwYXJhbSBvcHRpb25zIFNhbWUgb3B0aW9ucyBhcyBjcmVhdGVKb2IuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVKb2JGYWN0b3J5PEEgZXh0ZW5kcyBKc29uVmFsdWUsIEkgZXh0ZW5kcyBKc29uVmFsdWUsIE8gZXh0ZW5kcyBKc29uVmFsdWU+KFxuICBsb2FkZXI6ICgpID0+IFByb21pc2U8Sm9iSGFuZGxlcjxBLCBJLCBPPj4sXG4gIG9wdGlvbnM6IFBhcnRpYWw8Sm9iRGVzY3JpcHRpb24+ID0ge30sXG4pOiBKb2JIYW5kbGVyPEEsIEksIE8+IHtcbiAgY29uc3QgaGFuZGxlciA9IChhcmd1bWVudDogQSwgY29udGV4dDogSm9iSGFuZGxlckNvbnRleHQ8QSwgSSwgTz4pID0+IHtcbiAgICByZXR1cm4gZnJvbShsb2FkZXIoKSkucGlwZShzd2l0Y2hNYXAoKGZuKSA9PiBmbihhcmd1bWVudCwgY29udGV4dCkpKTtcbiAgfTtcblxuICByZXR1cm4gT2JqZWN0LmFzc2lnbihoYW5kbGVyLCB7IGpvYkRlc2NyaXB0aW9uOiBvcHRpb25zIH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBqb2IgdGhhdCBsb2dzIG91dCBpbnB1dC9vdXRwdXQgbWVzc2FnZXMgb2YgYW5vdGhlciBKb2IuIFRoZSBtZXNzYWdlcyBhcmUgc3RpbGxcbiAqIHByb3BhZ2F0ZWQgdG8gdGhlIG90aGVyIGpvYi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2dlckpvYjxBIGV4dGVuZHMgSnNvblZhbHVlLCBJIGV4dGVuZHMgSnNvblZhbHVlLCBPIGV4dGVuZHMgSnNvblZhbHVlPihcbiAgam9iOiBKb2JIYW5kbGVyPEEsIEksIE8+LFxuICBsb2dnZXI6IGxvZ2dpbmcuTG9nZ2VyQXBpLFxuKTogSm9iSGFuZGxlcjxBLCBJLCBPPiB7XG4gIGNvbnN0IGhhbmRsZXIgPSAoYXJndW1lbnQ6IEEsIGNvbnRleHQ6IEpvYkhhbmRsZXJDb250ZXh0PEEsIEksIE8+KSA9PiB7XG4gICAgY29udGV4dC5pbmJvdW5kQnVzXG4gICAgICAucGlwZSh0YXAoKG1lc3NhZ2UpID0+IGxvZ2dlci5pbmZvKGBJbnB1dDogJHtKU09OLnN0cmluZ2lmeShtZXNzYWdlKX1gKSkpXG4gICAgICAuc3Vic2NyaWJlKCk7XG5cbiAgICByZXR1cm4gam9iKGFyZ3VtZW50LCBjb250ZXh0KS5waXBlKFxuICAgICAgdGFwKFxuICAgICAgICAobWVzc2FnZSkgPT4gbG9nZ2VyLmluZm8oYE1lc3NhZ2U6ICR7SlNPTi5zdHJpbmdpZnkobWVzc2FnZSl9YCksXG4gICAgICAgIChlcnJvcikgPT4gbG9nZ2VyLndhcm4oYEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gKSxcbiAgICAgICAgKCkgPT4gbG9nZ2VyLmluZm8oYENvbXBsZXRlZGApLFxuICAgICAgKSxcbiAgICApO1xuICB9O1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKGhhbmRsZXIsIGpvYik7XG59XG4iXX0=