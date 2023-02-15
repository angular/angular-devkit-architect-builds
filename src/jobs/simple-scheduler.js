"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleScheduler = exports.JobOutputSchemaValidationError = exports.JobInboundMessageSchemaValidationError = exports.JobArgumentSchemaValidationError = void 0;
const core_1 = require("@angular-devkit/core");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const api_1 = require("./api");
const exception_1 = require("./exception");
class JobArgumentSchemaValidationError extends core_1.schema.SchemaValidationException {
    constructor(errors) {
        super(errors, 'Job Argument failed to validate. Errors: ');
    }
}
exports.JobArgumentSchemaValidationError = JobArgumentSchemaValidationError;
class JobInboundMessageSchemaValidationError extends core_1.schema.SchemaValidationException {
    constructor(errors) {
        super(errors, 'Job Inbound Message failed to validate. Errors: ');
    }
}
exports.JobInboundMessageSchemaValidationError = JobInboundMessageSchemaValidationError;
class JobOutputSchemaValidationError extends core_1.schema.SchemaValidationException {
    constructor(errors) {
        super(errors, 'Job Output failed to validate. Errors: ');
    }
}
exports.JobOutputSchemaValidationError = JobOutputSchemaValidationError;
function _jobShare() {
    // This is the same code as a `shareReplay()` operator, but uses a dumber Subject rather than a
    // ReplaySubject.
    return (source) => {
        let refCount = 0;
        let subject;
        let hasError = false;
        let isComplete = false;
        let subscription;
        return new rxjs_1.Observable((subscriber) => {
            let innerSub;
            refCount++;
            if (!subject) {
                subject = new rxjs_1.Subject();
                innerSub = subject.subscribe(subscriber);
                subscription = source.subscribe({
                    next(value) {
                        subject.next(value);
                    },
                    error(err) {
                        hasError = true;
                        subject.error(err);
                    },
                    complete() {
                        isComplete = true;
                        subject.complete();
                    },
                });
            }
            else {
                innerSub = subject.subscribe(subscriber);
            }
            return () => {
                refCount--;
                innerSub.unsubscribe();
                if (subscription && refCount === 0 && (isComplete || hasError)) {
                    subscription.unsubscribe();
                }
            };
        });
    };
}
/**
 * Simple scheduler. Should be the base of all registries and schedulers.
 */
class SimpleScheduler {
    constructor(_jobRegistry, _schemaRegistry = new core_1.schema.CoreSchemaRegistry()) {
        this._jobRegistry = _jobRegistry;
        this._schemaRegistry = _schemaRegistry;
        this._internalJobDescriptionMap = new Map();
        this._queue = [];
        this._pauseCounter = 0;
    }
    _getInternalDescription(name) {
        const maybeHandler = this._internalJobDescriptionMap.get(name);
        if (maybeHandler !== undefined) {
            return (0, rxjs_1.of)(maybeHandler);
        }
        const handler = this._jobRegistry.get(name);
        return handler.pipe((0, operators_1.switchMap)((handler) => {
            if (handler === null) {
                return (0, rxjs_1.of)(null);
            }
            const description = {
                // Make a copy of it to be sure it's proper JSON.
                ...JSON.parse(JSON.stringify(handler.jobDescription)),
                name: handler.jobDescription.name || name,
                argument: handler.jobDescription.argument || true,
                input: handler.jobDescription.input || true,
                output: handler.jobDescription.output || true,
                channels: handler.jobDescription.channels || {},
            };
            const handlerWithExtra = Object.assign(handler.bind(undefined), {
                jobDescription: description,
                argumentV: this._schemaRegistry.compile(description.argument),
                inputV: this._schemaRegistry.compile(description.input),
                outputV: this._schemaRegistry.compile(description.output),
            });
            this._internalJobDescriptionMap.set(name, handlerWithExtra);
            return (0, rxjs_1.of)(handlerWithExtra);
        }));
    }
    /**
     * Get a job description for a named job.
     *
     * @param name The name of the job.
     * @returns A description, or null if the job is not registered.
     */
    getDescription(name) {
        return (0, rxjs_1.concat)(this._getInternalDescription(name).pipe((0, operators_1.map)((x) => x && x.jobDescription)), (0, rxjs_1.of)(null)).pipe((0, operators_1.first)());
    }
    /**
     * Returns true if the job name has been registered.
     * @param name The name of the job.
     * @returns True if the job exists, false otherwise.
     */
    has(name) {
        return this.getDescription(name).pipe((0, operators_1.map)((x) => x !== null));
    }
    /**
     * Pause the scheduler, temporary queueing _new_ jobs. Returns a resume function that should be
     * used to resume execution. If multiple `pause()` were called, all their resume functions must
     * be called before the Scheduler actually starts new jobs. Additional calls to the same resume
     * function will have no effect.
     *
     * Jobs already running are NOT paused. This is pausing the scheduler only.
     */
    pause() {
        let called = false;
        this._pauseCounter++;
        return () => {
            if (!called) {
                called = true;
                if (--this._pauseCounter == 0) {
                    // Resume the queue.
                    const q = this._queue;
                    this._queue = [];
                    q.forEach((fn) => fn());
                }
            }
        };
    }
    /**
     * Schedule a job to be run, using its name.
     * @param name The name of job to be run.
     * @param argument The argument to send to the job when starting it.
     * @param options Scheduling options.
     * @returns The Job being run.
     */
    schedule(name, argument, options) {
        if (this._pauseCounter > 0) {
            const waitable = new rxjs_1.Subject();
            this._queue.push(() => waitable.complete());
            return this._scheduleJob(name, argument, options || {}, waitable);
        }
        return this._scheduleJob(name, argument, options || {}, rxjs_1.EMPTY);
    }
    /**
     * Filter messages.
     * @private
     */
    _filterJobOutboundMessages(message, state) {
        switch (message.kind) {
            case api_1.JobOutboundMessageKind.OnReady:
                return state == api_1.JobState.Queued;
            case api_1.JobOutboundMessageKind.Start:
                return state == api_1.JobState.Ready;
            case api_1.JobOutboundMessageKind.End:
                return state == api_1.JobState.Started || state == api_1.JobState.Ready;
        }
        return true;
    }
    /**
     * Return a new state. This is just to simplify the reading of the _createJob method.
     * @private
     */
    _updateState(message, state) {
        switch (message.kind) {
            case api_1.JobOutboundMessageKind.OnReady:
                return api_1.JobState.Ready;
            case api_1.JobOutboundMessageKind.Start:
                return api_1.JobState.Started;
            case api_1.JobOutboundMessageKind.End:
                return api_1.JobState.Ended;
        }
        return state;
    }
    /**
     * Create the job.
     * @private
     */
    // eslint-disable-next-line max-lines-per-function
    _createJob(name, argument, handler, inboundBus, outboundBus) {
        const schemaRegistry = this._schemaRegistry;
        const channelsSubject = new Map();
        const channels = new Map();
        let state = api_1.JobState.Queued;
        let pingId = 0;
        // Create the input channel by having a filter.
        const input = new rxjs_1.Subject();
        input
            .pipe((0, operators_1.concatMap)((message) => handler.pipe((0, operators_1.switchMap)(async (handler) => {
            if (handler === null) {
                throw new exception_1.JobDoesNotExistException(name);
            }
            const validator = await handler.inputV;
            return validator(message);
        }))), (0, operators_1.filter)((result) => result.success), (0, operators_1.map)((result) => result.data))
            .subscribe((value) => inboundBus.next({ kind: api_1.JobInboundMessageKind.Input, value }));
        outboundBus = (0, rxjs_1.concat)(outboundBus, 
        // Add an End message at completion. This will be filtered out if the job actually send an
        // End.
        handler.pipe((0, operators_1.switchMap)((handler) => {
            if (handler) {
                return (0, rxjs_1.of)({
                    kind: api_1.JobOutboundMessageKind.End,
                    description: handler.jobDescription,
                });
            }
            else {
                return rxjs_1.EMPTY;
            }
        }))).pipe((0, operators_1.filter)((message) => this._filterJobOutboundMessages(message, state)), 
        // Update internal logic and Job<> members.
        (0, operators_1.tap)((message) => {
            // Update the state.
            state = this._updateState(message, state);
            switch (message.kind) {
                case api_1.JobOutboundMessageKind.ChannelCreate: {
                    const maybeSubject = channelsSubject.get(message.name);
                    // If it doesn't exist or it's closed on the other end.
                    if (!maybeSubject) {
                        const s = new rxjs_1.Subject();
                        channelsSubject.set(message.name, s);
                        channels.set(message.name, s.asObservable());
                    }
                    break;
                }
                case api_1.JobOutboundMessageKind.ChannelMessage: {
                    const maybeSubject = channelsSubject.get(message.name);
                    if (maybeSubject) {
                        maybeSubject.next(message.message);
                    }
                    break;
                }
                case api_1.JobOutboundMessageKind.ChannelComplete: {
                    const maybeSubject = channelsSubject.get(message.name);
                    if (maybeSubject) {
                        maybeSubject.complete();
                        channelsSubject.delete(message.name);
                    }
                    break;
                }
                case api_1.JobOutboundMessageKind.ChannelError: {
                    const maybeSubject = channelsSubject.get(message.name);
                    if (maybeSubject) {
                        maybeSubject.error(message.error);
                        channelsSubject.delete(message.name);
                    }
                    break;
                }
            }
        }, () => {
            state = api_1.JobState.Errored;
        }), 
        // Do output validation (might include default values so this might have side
        // effects). We keep all messages in order.
        (0, operators_1.concatMap)((message) => {
            if (message.kind !== api_1.JobOutboundMessageKind.Output) {
                return (0, rxjs_1.of)(message);
            }
            return handler.pipe((0, operators_1.switchMap)(async (handler) => {
                if (handler === null) {
                    throw new exception_1.JobDoesNotExistException(name);
                }
                const validate = await handler.outputV;
                const output = await validate(message.value);
                if (!output.success) {
                    throw new JobOutputSchemaValidationError(output.errors);
                }
                return {
                    ...message,
                    output: output.data,
                };
            }));
        }), _jobShare());
        const output = outboundBus.pipe((0, operators_1.filter)((x) => x.kind == api_1.JobOutboundMessageKind.Output), (0, operators_1.map)((x) => x.value), (0, operators_1.shareReplay)(1));
        // Return the Job.
        return {
            get state() {
                return state;
            },
            argument,
            description: handler.pipe((0, operators_1.switchMap)((handler) => {
                if (handler === null) {
                    throw new exception_1.JobDoesNotExistException(name);
                }
                else {
                    return (0, rxjs_1.of)(handler.jobDescription);
                }
            })),
            output,
            getChannel(name, schema = true) {
                let maybeObservable = channels.get(name);
                if (!maybeObservable) {
                    const s = new rxjs_1.Subject();
                    channelsSubject.set(name, s);
                    channels.set(name, s.asObservable());
                    maybeObservable = s.asObservable();
                }
                return maybeObservable.pipe(
                // Keep the order of messages.
                (0, operators_1.concatMap)((message) => {
                    return (0, rxjs_1.from)(schemaRegistry.compile(schema)).pipe((0, operators_1.switchMap)((validate) => validate(message)), (0, operators_1.filter)((x) => x.success), (0, operators_1.map)((x) => x.data));
                }));
            },
            ping() {
                const id = pingId++;
                inboundBus.next({ kind: api_1.JobInboundMessageKind.Ping, id });
                return outboundBus.pipe((0, operators_1.filter)((x) => x.kind === api_1.JobOutboundMessageKind.Pong && x.id == id), (0, operators_1.first)(), (0, operators_1.ignoreElements)());
            },
            stop() {
                inboundBus.next({ kind: api_1.JobInboundMessageKind.Stop });
            },
            input,
            inboundBus,
            outboundBus,
        };
    }
    _scheduleJob(name, argument, options, waitable) {
        // Get handler first, since this can error out if there's no handler for the job name.
        const handler = this._getInternalDescription(name);
        const optionsDeps = (options && options.dependencies) || [];
        const dependencies = Array.isArray(optionsDeps) ? optionsDeps : [optionsDeps];
        const inboundBus = new rxjs_1.Subject();
        const outboundBus = (0, rxjs_1.concat)(
        // Wait for dependencies, make sure to not report messages from dependencies. Subscribe to
        // all dependencies at the same time so they run concurrently.
        (0, rxjs_1.merge)(...dependencies.map((x) => x.outboundBus)).pipe((0, operators_1.ignoreElements)()), 
        // Wait for pause() to clear (if necessary).
        waitable, (0, rxjs_1.from)(handler).pipe((0, operators_1.switchMap)((handler) => new rxjs_1.Observable((subscriber) => {
            if (!handler) {
                throw new exception_1.JobDoesNotExistException(name);
            }
            // Validate the argument.
            return (0, rxjs_1.from)(handler.argumentV)
                .pipe((0, operators_1.switchMap)((validate) => validate(argument)), (0, operators_1.switchMap)((output) => {
                if (!output.success) {
                    throw new JobArgumentSchemaValidationError(output.errors);
                }
                const argument = output.data;
                const description = handler.jobDescription;
                subscriber.next({ kind: api_1.JobOutboundMessageKind.OnReady, description });
                const context = {
                    description,
                    dependencies: [...dependencies],
                    inboundBus: inboundBus.asObservable(),
                    scheduler: this,
                };
                return handler(argument, context);
            }))
                .subscribe(subscriber);
        }))));
        return this._createJob(name, argument, handler, inboundBus, outboundBus);
    }
}
exports.SimpleScheduler = SimpleScheduler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlLXNjaGVkdWxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvam9icy9zaW1wbGUtc2NoZWR1bGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7OztBQUVILCtDQUF5RDtBQUN6RCwrQkFXYztBQUNkLDhDQVN3QjtBQUN4QiwrQkFjZTtBQUNmLDJDQUF1RDtBQUV2RCxNQUFhLGdDQUFpQyxTQUFRLGFBQU0sQ0FBQyx5QkFBeUI7SUFDcEYsWUFBWSxNQUFzQztRQUNoRCxLQUFLLENBQUMsTUFBTSxFQUFFLDJDQUEyQyxDQUFDLENBQUM7SUFDN0QsQ0FBQztDQUNGO0FBSkQsNEVBSUM7QUFDRCxNQUFhLHNDQUF1QyxTQUFRLGFBQU0sQ0FBQyx5QkFBeUI7SUFDMUYsWUFBWSxNQUFzQztRQUNoRCxLQUFLLENBQUMsTUFBTSxFQUFFLGtEQUFrRCxDQUFDLENBQUM7SUFDcEUsQ0FBQztDQUNGO0FBSkQsd0ZBSUM7QUFDRCxNQUFhLDhCQUErQixTQUFRLGFBQU0sQ0FBQyx5QkFBeUI7SUFDbEYsWUFBWSxNQUFzQztRQUNoRCxLQUFLLENBQUMsTUFBTSxFQUFFLHlDQUF5QyxDQUFDLENBQUM7SUFDM0QsQ0FBQztDQUNGO0FBSkQsd0VBSUM7QUFVRCxTQUFTLFNBQVM7SUFDaEIsK0ZBQStGO0lBQy9GLGlCQUFpQjtJQUNqQixPQUFPLENBQUMsTUFBcUIsRUFBaUIsRUFBRTtRQUM5QyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDakIsSUFBSSxPQUFtQixDQUFDO1FBQ3hCLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztRQUNyQixJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDdkIsSUFBSSxZQUEwQixDQUFDO1FBRS9CLE9BQU8sSUFBSSxpQkFBVSxDQUFJLENBQUMsVUFBVSxFQUFFLEVBQUU7WUFD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NmFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IEpzb25WYWx1ZSwgc2NoZW1hIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHtcbiAgRU1QVFksXG4gIE1vbm9UeXBlT3BlcmF0b3JGdW5jdGlvbixcbiAgT2JzZXJ2YWJsZSxcbiAgT2JzZXJ2ZXIsXG4gIFN1YmplY3QsXG4gIFN1YnNjcmlwdGlvbixcbiAgY29uY2F0LFxuICBmcm9tLFxuICBtZXJnZSxcbiAgb2YsXG59IGZyb20gJ3J4anMnO1xuaW1wb3J0IHtcbiAgY29uY2F0TWFwLFxuICBmaWx0ZXIsXG4gIGZpcnN0LFxuICBpZ25vcmVFbGVtZW50cyxcbiAgbWFwLFxuICBzaGFyZVJlcGxheSxcbiAgc3dpdGNoTWFwLFxuICB0YXAsXG59IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcbmltcG9ydCB7XG4gIEpvYixcbiAgSm9iRGVzY3JpcHRpb24sXG4gIEpvYkhhbmRsZXIsXG4gIEpvYkluYm91bmRNZXNzYWdlLFxuICBKb2JJbmJvdW5kTWVzc2FnZUtpbmQsXG4gIEpvYk5hbWUsXG4gIEpvYk91dGJvdW5kTWVzc2FnZSxcbiAgSm9iT3V0Ym91bmRNZXNzYWdlS2luZCxcbiAgSm9iT3V0Ym91bmRNZXNzYWdlT3V0cHV0LFxuICBKb2JTdGF0ZSxcbiAgUmVnaXN0cnksXG4gIFNjaGVkdWxlSm9iT3B0aW9ucyxcbiAgU2NoZWR1bGVyLFxufSBmcm9tICcuL2FwaSc7XG5pbXBvcnQgeyBKb2JEb2VzTm90RXhpc3RFeGNlcHRpb24gfSBmcm9tICcuL2V4Y2VwdGlvbic7XG5cbmV4cG9ydCBjbGFzcyBKb2JBcmd1bWVudFNjaGVtYVZhbGlkYXRpb25FcnJvciBleHRlbmRzIHNjaGVtYS5TY2hlbWFWYWxpZGF0aW9uRXhjZXB0aW9uIHtcbiAgY29uc3RydWN0b3IoZXJyb3JzPzogc2NoZW1hLlNjaGVtYVZhbGlkYXRvckVycm9yW10pIHtcbiAgICBzdXBlcihlcnJvcnMsICdKb2IgQXJndW1lbnQgZmFpbGVkIHRvIHZhbGlkYXRlLiBFcnJvcnM6ICcpO1xuICB9XG59XG5leHBvcnQgY2xhc3MgSm9iSW5ib3VuZE1lc3NhZ2VTY2hlbWFWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBzY2hlbWEuU2NoZW1hVmFsaWRhdGlvbkV4Y2VwdGlvbiB7XG4gIGNvbnN0cnVjdG9yKGVycm9ycz86IHNjaGVtYS5TY2hlbWFWYWxpZGF0b3JFcnJvcltdKSB7XG4gICAgc3VwZXIoZXJyb3JzLCAnSm9iIEluYm91bmQgTWVzc2FnZSBmYWlsZWQgdG8gdmFsaWRhdGUuIEVycm9yczogJyk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBKb2JPdXRwdXRTY2hlbWFWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBzY2hlbWEuU2NoZW1hVmFsaWRhdGlvbkV4Y2VwdGlvbiB7XG4gIGNvbnN0cnVjdG9yKGVycm9ycz86IHNjaGVtYS5TY2hlbWFWYWxpZGF0b3JFcnJvcltdKSB7XG4gICAgc3VwZXIoZXJyb3JzLCAnSm9iIE91dHB1dCBmYWlsZWQgdG8gdmFsaWRhdGUuIEVycm9yczogJyk7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEpvYkhhbmRsZXJXaXRoRXh0cmEgZXh0ZW5kcyBKb2JIYW5kbGVyPEpzb25WYWx1ZSwgSnNvblZhbHVlLCBKc29uVmFsdWU+IHtcbiAgam9iRGVzY3JpcHRpb246IEpvYkRlc2NyaXB0aW9uO1xuXG4gIGFyZ3VtZW50VjogUHJvbWlzZTxzY2hlbWEuU2NoZW1hVmFsaWRhdG9yPjtcbiAgb3V0cHV0VjogUHJvbWlzZTxzY2hlbWEuU2NoZW1hVmFsaWRhdG9yPjtcbiAgaW5wdXRWOiBQcm9taXNlPHNjaGVtYS5TY2hlbWFWYWxpZGF0b3I+O1xufVxuXG5mdW5jdGlvbiBfam9iU2hhcmU8VD4oKTogTW9ub1R5cGVPcGVyYXRvckZ1bmN0aW9uPFQ+IHtcbiAgLy8gVGhpcyBpcyB0aGUgc2FtZSBjb2RlIGFzIGEgYHNoYXJlUmVwbGF5KClgIG9wZXJhdG9yLCBidXQgdXNlcyBhIGR1bWJlciBTdWJqZWN0IHJhdGhlciB0aGFuIGFcbiAgLy8gUmVwbGF5U3ViamVjdC5cbiAgcmV0dXJuIChzb3VyY2U6IE9ic2VydmFibGU8VD4pOiBPYnNlcnZhYmxlPFQ+ID0+IHtcbiAgICBsZXQgcmVmQ291bnQgPSAwO1xuICAgIGxldCBzdWJqZWN0OiBTdWJqZWN0PFQ+O1xuICAgIGxldCBoYXNFcnJvciA9IGZhbHNlO1xuICAgIGxldCBpc0NvbXBsZXRlID0gZmFsc2U7XG4gICAgbGV0IHN1YnNjcmlwdGlvbjogU3Vic2NyaXB0aW9uO1xuXG4gICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPFQ+KChzdWJzY3JpYmVyKSA9PiB7XG4gICAgICBsZXQgaW5uZXJTdWI6IFN1YnNjcmlwdGlvbjtcbiAgICAgIHJlZkNvdW50Kys7XG4gICAgICBpZiAoIXN1YmplY3QpIHtcbiAgICAgICAgc3ViamVjdCA9IG5ldyBTdWJqZWN0PFQ+KCk7XG5cbiAgICAgICAgaW5uZXJTdWIgPSBzdWJqZWN0LnN1YnNjcmliZShzdWJzY3JpYmVyKTtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gc291cmNlLnN1YnNjcmliZSh7XG4gICAgICAgICAgbmV4dCh2YWx1ZSkge1xuICAgICAgICAgICAgc3ViamVjdC5uZXh0KHZhbHVlKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGVycm9yKGVycikge1xuICAgICAgICAgICAgaGFzRXJyb3IgPSB0cnVlO1xuICAgICAgICAgICAgc3ViamVjdC5lcnJvcihlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgY29tcGxldGUoKSB7XG4gICAgICAgICAgICBpc0NvbXBsZXRlID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1YmplY3QuY29tcGxldGUoKTtcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlubmVyU3ViID0gc3ViamVjdC5zdWJzY3JpYmUoc3Vic2NyaWJlcik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIHJlZkNvdW50LS07XG4gICAgICAgIGlubmVyU3ViLnVuc3Vic2NyaWJlKCk7XG4gICAgICAgIGlmIChzdWJzY3JpcHRpb24gJiYgcmVmQ291bnQgPT09IDAgJiYgKGlzQ29tcGxldGUgfHwgaGFzRXJyb3IpKSB7XG4gICAgICAgICAgc3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfSk7XG4gIH07XG59XG5cbi8qKlxuICogU2ltcGxlIHNjaGVkdWxlci4gU2hvdWxkIGJlIHRoZSBiYXNlIG9mIGFsbCByZWdpc3RyaWVzIGFuZCBzY2hlZHVsZXJzLlxuICovXG5leHBvcnQgY2xhc3MgU2ltcGxlU2NoZWR1bGVyPFxuICBNaW5pbXVtQXJndW1lbnRUIGV4dGVuZHMgSnNvblZhbHVlID0gSnNvblZhbHVlLFxuICBNaW5pbXVtSW5wdXRUIGV4dGVuZHMgSnNvblZhbHVlID0gSnNvblZhbHVlLFxuICBNaW5pbXVtT3V0cHV0VCBleHRlbmRzIEpzb25WYWx1ZSA9IEpzb25WYWx1ZSxcbj4gaW1wbGVtZW50cyBTY2hlZHVsZXI8TWluaW11bUFyZ3VtZW50VCwgTWluaW11bUlucHV0VCwgTWluaW11bU91dHB1dFQ+XG57XG4gIHByaXZhdGUgX2ludGVybmFsSm9iRGVzY3JpcHRpb25NYXAgPSBuZXcgTWFwPEpvYk5hbWUsIEpvYkhhbmRsZXJXaXRoRXh0cmE+KCk7XG4gIHByaXZhdGUgX3F1ZXVlOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuICBwcml2YXRlIF9wYXVzZUNvdW50ZXIgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByb3RlY3RlZCBfam9iUmVnaXN0cnk6IFJlZ2lzdHJ5PE1pbmltdW1Bcmd1bWVudFQsIE1pbmltdW1JbnB1dFQsIE1pbmltdW1PdXRwdXRUPixcbiAgICBwcm90ZWN0ZWQgX3NjaGVtYVJlZ2lzdHJ5OiBzY2hlbWEuU2NoZW1hUmVnaXN0cnkgPSBuZXcgc2NoZW1hLkNvcmVTY2hlbWFSZWdpc3RyeSgpLFxuICApIHt9XG5cbiAgcHJpdmF0ZSBfZ2V0SW50ZXJuYWxEZXNjcmlwdGlvbihuYW1lOiBKb2JOYW1lKTogT2JzZXJ2YWJsZTxKb2JIYW5kbGVyV2l0aEV4dHJhIHwgbnVsbD4ge1xuICAgIGNvbnN0IG1heWJlSGFuZGxlciA9IHRoaXMuX2ludGVybmFsSm9iRGVzY3JpcHRpb25NYXAuZ2V0KG5hbWUpO1xuICAgIGlmIChtYXliZUhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIG9mKG1heWJlSGFuZGxlcik7XG4gICAgfVxuXG4gICAgY29uc3QgaGFuZGxlciA9IHRoaXMuX2pvYlJlZ2lzdHJ5LmdldDxNaW5pbXVtQXJndW1lbnRULCBNaW5pbXVtSW5wdXRULCBNaW5pbXVtT3V0cHV0VD4obmFtZSk7XG5cbiAgICByZXR1cm4gaGFuZGxlci5waXBlKFxuICAgICAgc3dpdGNoTWFwKChoYW5kbGVyKSA9PiB7XG4gICAgICAgIGlmIChoYW5kbGVyID09PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIG9mKG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGVzY3JpcHRpb246IEpvYkRlc2NyaXB0aW9uID0ge1xuICAgICAgICAgIC8vIE1ha2UgYSBjb3B5IG9mIGl0IHRvIGJlIHN1cmUgaXQncyBwcm9wZXIgSlNPTi5cbiAgICAgICAgICAuLi5KU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGhhbmRsZXIuam9iRGVzY3JpcHRpb24pKSxcbiAgICAgICAgICBuYW1lOiBoYW5kbGVyLmpvYkRlc2NyaXB0aW9uLm5hbWUgfHwgbmFtZSxcbiAgICAgICAgICBhcmd1bWVudDogaGFuZGxlci5qb2JEZXNjcmlwdGlvbi5hcmd1bWVudCB8fCB0cnVlLFxuICAgICAgICAgIGlucHV0OiBoYW5kbGVyLmpvYkRlc2NyaXB0aW9uLmlucHV0IHx8IHRydWUsXG4gICAgICAgICAgb3V0cHV0OiBoYW5kbGVyLmpvYkRlc2NyaXB0aW9uLm91dHB1dCB8fCB0cnVlLFxuICAgICAgICAgIGNoYW5uZWxzOiBoYW5kbGVyLmpvYkRlc2NyaXB0aW9uLmNoYW5uZWxzIHx8IHt9LFxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGhhbmRsZXJXaXRoRXh0cmEgPSBPYmplY3QuYXNzaWduKGhhbmRsZXIuYmluZCh1bmRlZmluZWQpLCB7XG4gICAgICAgICAgam9iRGVzY3JpcHRpb246IGRlc2NyaXB0aW9uLFxuICAgICAgICAgIGFyZ3VtZW50VjogdGhpcy5fc2NoZW1hUmVnaXN0cnkuY29tcGlsZShkZXNjcmlwdGlvbi5hcmd1bWVudCksXG4gICAgICAgICAgaW5wdXRWOiB0aGlzLl9zY2hlbWFSZWdpc3RyeS5jb21waWxlKGRlc2NyaXB0aW9uLmlucHV0KSxcbiAgICAgICAgICBvdXRwdXRWOiB0aGlzLl9zY2hlbWFSZWdpc3RyeS5jb21waWxlKGRlc2NyaXB0aW9uLm91dHB1dCksXG4gICAgICAgIH0pIGFzIEpvYkhhbmRsZXJXaXRoRXh0cmE7XG4gICAgICAgIHRoaXMuX2ludGVybmFsSm9iRGVzY3JpcHRpb25NYXAuc2V0KG5hbWUsIGhhbmRsZXJXaXRoRXh0cmEpO1xuXG4gICAgICAgIHJldHVybiBvZihoYW5kbGVyV2l0aEV4dHJhKTtcbiAgICAgIH0pLFxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGEgam9iIGRlc2NyaXB0aW9uIGZvciBhIG5hbWVkIGpvYi5cbiAgICpcbiAgICogQHBhcmFtIG5hbWUgVGhlIG5hbWUgb2YgdGhlIGpvYi5cbiAgICogQHJldHVybnMgQSBkZXNjcmlwdGlvbiwgb3IgbnVsbCBpZiB0aGUgam9iIGlzIG5vdCByZWdpc3RlcmVkLlxuICAgKi9cbiAgZ2V0RGVzY3JpcHRpb24obmFtZTogSm9iTmFtZSkge1xuICAgIHJldHVybiBjb25jYXQoXG4gICAgICB0aGlzLl9nZXRJbnRlcm5hbERlc2NyaXB0aW9uKG5hbWUpLnBpcGUobWFwKCh4KSA9PiB4ICYmIHguam9iRGVzY3JpcHRpb24pKSxcbiAgICAgIG9mKG51bGwpLFxuICAgICkucGlwZShmaXJzdCgpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGpvYiBuYW1lIGhhcyBiZWVuIHJlZ2lzdGVyZWQuXG4gICAqIEBwYXJhbSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBqb2IuXG4gICAqIEByZXR1cm5zIFRydWUgaWYgdGhlIGpvYiBleGlzdHMsIGZhbHNlIG90aGVyd2lzZS5cbiAgICovXG4gIGhhcyhuYW1lOiBKb2JOYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0RGVzY3JpcHRpb24obmFtZSkucGlwZShtYXAoKHgpID0+IHggIT09IG51bGwpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXVzZSB0aGUgc2NoZWR1bGVyLCB0ZW1wb3JhcnkgcXVldWVpbmcgX25ld18gam9icy4gUmV0dXJucyBhIHJlc3VtZSBmdW5jdGlvbiB0aGF0IHNob3VsZCBiZVxuICAgKiB1c2VkIHRvIHJlc3VtZSBleGVjdXRpb24uIElmIG11bHRpcGxlIGBwYXVzZSgpYCB3ZXJlIGNhbGxlZCwgYWxsIHRoZWlyIHJlc3VtZSBmdW5jdGlvbnMgbXVzdFxuICAgKiBiZSBjYWxsZWQgYmVmb3JlIHRoZSBTY2hlZHVsZXIgYWN0dWFsbHkgc3RhcnRzIG5ldyBqb2JzLiBBZGRpdGlvbmFsIGNhbGxzIHRvIHRoZSBzYW1lIHJlc3VtZVxuICAgKiBmdW5jdGlvbiB3aWxsIGhhdmUgbm8gZWZmZWN0LlxuICAgKlxuICAgKiBKb2JzIGFscmVhZHkgcnVubmluZyBhcmUgTk9UIHBhdXNlZC4gVGhpcyBpcyBwYXVzaW5nIHRoZSBzY2hlZHVsZXIgb25seS5cbiAgICovXG4gIHBhdXNlKCkge1xuICAgIGxldCBjYWxsZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZUNvdW50ZXIrKztcblxuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICBpZiAoIWNhbGxlZCkge1xuICAgICAgICBjYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoLS10aGlzLl9wYXVzZUNvdW50ZXIgPT0gMCkge1xuICAgICAgICAgIC8vIFJlc3VtZSB0aGUgcXVldWUuXG4gICAgICAgICAgY29uc3QgcSA9IHRoaXMuX3F1ZXVlO1xuICAgICAgICAgIHRoaXMuX3F1ZXVlID0gW107XG4gICAgICAgICAgcS5mb3JFYWNoKChmbikgPT4gZm4oKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVkdWxlIGEgam9iIHRvIGJlIHJ1biwgdXNpbmcgaXRzIG5hbWUuXG4gICAqIEBwYXJhbSBuYW1lIFRoZSBuYW1lIG9mIGpvYiB0byBiZSBydW4uXG4gICAqIEBwYXJhbSBhcmd1bWVudCBUaGUgYXJndW1lbnQgdG8gc2VuZCB0byB0aGUgam9iIHdoZW4gc3RhcnRpbmcgaXQuXG4gICAqIEBwYXJhbSBvcHRpb25zIFNjaGVkdWxpbmcgb3B0aW9ucy5cbiAgICogQHJldHVybnMgVGhlIEpvYiBiZWluZyBydW4uXG4gICAqL1xuICBzY2hlZHVsZTxBIGV4dGVuZHMgTWluaW11bUFyZ3VtZW50VCwgSSBleHRlbmRzIE1pbmltdW1JbnB1dFQsIE8gZXh0ZW5kcyBNaW5pbXVtT3V0cHV0VD4oXG4gICAgbmFtZTogSm9iTmFtZSxcbiAgICBhcmd1bWVudDogQSxcbiAgICBvcHRpb25zPzogU2NoZWR1bGVKb2JPcHRpb25zLFxuICApOiBKb2I8QSwgSSwgTz4ge1xuICAgIGlmICh0aGlzLl9wYXVzZUNvdW50ZXIgPiAwKSB7XG4gICAgICBjb25zdCB3YWl0YWJsZSA9IG5ldyBTdWJqZWN0PG5ldmVyPigpO1xuICAgICAgdGhpcy5fcXVldWUucHVzaCgoKSA9PiB3YWl0YWJsZS5jb21wbGV0ZSgpKTtcblxuICAgICAgcmV0dXJuIHRoaXMuX3NjaGVkdWxlSm9iPEEsIEksIE8+KG5hbWUsIGFyZ3VtZW50LCBvcHRpb25zIHx8IHt9LCB3YWl0YWJsZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX3NjaGVkdWxlSm9iPEEsIEksIE8+KG5hbWUsIGFyZ3VtZW50LCBvcHRpb25zIHx8IHt9LCBFTVBUWSk7XG4gIH1cblxuICAvKipcbiAgICogRmlsdGVyIG1lc3NhZ2VzLlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHJpdmF0ZSBfZmlsdGVySm9iT3V0Ym91bmRNZXNzYWdlczxPIGV4dGVuZHMgTWluaW11bU91dHB1dFQ+KFxuICAgIG1lc3NhZ2U6IEpvYk91dGJvdW5kTWVzc2FnZTxPPixcbiAgICBzdGF0ZTogSm9iU3RhdGUsXG4gICkge1xuICAgIHN3aXRjaCAobWVzc2FnZS5raW5kKSB7XG4gICAgICBjYXNlIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuT25SZWFkeTpcbiAgICAgICAgcmV0dXJuIHN0YXRlID09IEpvYlN0YXRlLlF1ZXVlZDtcbiAgICAgIGNhc2UgSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5TdGFydDpcbiAgICAgICAgcmV0dXJuIHN0YXRlID09IEpvYlN0YXRlLlJlYWR5O1xuXG4gICAgICBjYXNlIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuRW5kOlxuICAgICAgICByZXR1cm4gc3RhdGUgPT0gSm9iU3RhdGUuU3RhcnRlZCB8fCBzdGF0ZSA9PSBKb2JTdGF0ZS5SZWFkeTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm4gYSBuZXcgc3RhdGUuIFRoaXMgaXMganVzdCB0byBzaW1wbGlmeSB0aGUgcmVhZGluZyBvZiB0aGUgX2NyZWF0ZUpvYiBtZXRob2QuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlIF91cGRhdGVTdGF0ZTxPIGV4dGVuZHMgTWluaW11bU91dHB1dFQ+KFxuICAgIG1lc3NhZ2U6IEpvYk91dGJvdW5kTWVzc2FnZTxPPixcbiAgICBzdGF0ZTogSm9iU3RhdGUsXG4gICk6IEpvYlN0YXRlIHtcbiAgICBzd2l0Y2ggKG1lc3NhZ2Uua2luZCkge1xuICAgICAgY2FzZSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLk9uUmVhZHk6XG4gICAgICAgIHJldHVybiBKb2JTdGF0ZS5SZWFkeTtcbiAgICAgIGNhc2UgSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5TdGFydDpcbiAgICAgICAgcmV0dXJuIEpvYlN0YXRlLlN0YXJ0ZWQ7XG4gICAgICBjYXNlIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuRW5kOlxuICAgICAgICByZXR1cm4gSm9iU3RhdGUuRW5kZWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0YXRlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSB0aGUgam9iLlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG1heC1saW5lcy1wZXItZnVuY3Rpb25cbiAgcHJpdmF0ZSBfY3JlYXRlSm9iPEEgZXh0ZW5kcyBNaW5pbXVtQXJndW1lbnRULCBJIGV4dGVuZHMgTWluaW11bUlucHV0VCwgTyBleHRlbmRzIE1pbmltdW1PdXRwdXRUPihcbiAgICBuYW1lOiBKb2JOYW1lLFxuICAgIGFyZ3VtZW50OiBBLFxuICAgIGhhbmRsZXI6IE9ic2VydmFibGU8Sm9iSGFuZGxlcldpdGhFeHRyYSB8IG51bGw+LFxuICAgIGluYm91bmRCdXM6IE9ic2VydmVyPEpvYkluYm91bmRNZXNzYWdlPEk+PixcbiAgICBvdXRib3VuZEJ1czogT2JzZXJ2YWJsZTxKb2JPdXRib3VuZE1lc3NhZ2U8Tz4+LFxuICApOiBKb2I8QSwgSSwgTz4ge1xuICAgIGNvbnN0IHNjaGVtYVJlZ2lzdHJ5ID0gdGhpcy5fc2NoZW1hUmVnaXN0cnk7XG5cbiAgICBjb25zdCBjaGFubmVsc1N1YmplY3QgPSBuZXcgTWFwPHN0cmluZywgU3ViamVjdDxKc29uVmFsdWU+PigpO1xuICAgIGNvbnN0IGNoYW5uZWxzID0gbmV3IE1hcDxzdHJpbmcsIE9ic2VydmFibGU8SnNvblZhbHVlPj4oKTtcblxuICAgIGxldCBzdGF0ZSA9IEpvYlN0YXRlLlF1ZXVlZDtcbiAgICBsZXQgcGluZ0lkID0gMDtcblxuICAgIC8vIENyZWF0ZSB0aGUgaW5wdXQgY2hhbm5lbCBieSBoYXZpbmcgYSBmaWx0ZXIuXG4gICAgY29uc3QgaW5wdXQgPSBuZXcgU3ViamVjdDxKc29uVmFsdWU+KCk7XG4gICAgaW5wdXRcbiAgICAgIC5waXBlKFxuICAgICAgICBjb25jYXRNYXAoKG1lc3NhZ2UpID0+XG4gICAgICAgICAgaGFuZGxlci5waXBlKFxuICAgICAgICAgICAgc3dpdGNoTWFwKGFzeW5jIChoYW5kbGVyKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChoYW5kbGVyID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEpvYkRvZXNOb3RFeGlzdEV4Y2VwdGlvbihuYW1lKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGNvbnN0IHZhbGlkYXRvciA9IGF3YWl0IGhhbmRsZXIuaW5wdXRWO1xuXG4gICAgICAgICAgICAgIHJldHVybiB2YWxpZGF0b3IobWVzc2FnZSk7XG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICApLFxuICAgICAgICApLFxuICAgICAgICBmaWx0ZXIoKHJlc3VsdCkgPT4gcmVzdWx0LnN1Y2Nlc3MpLFxuICAgICAgICBtYXAoKHJlc3VsdCkgPT4gcmVzdWx0LmRhdGEgYXMgSSksXG4gICAgICApXG4gICAgICAuc3Vic2NyaWJlKCh2YWx1ZSkgPT4gaW5ib3VuZEJ1cy5uZXh0KHsga2luZDogSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLklucHV0LCB2YWx1ZSB9KSk7XG5cbiAgICBvdXRib3VuZEJ1cyA9IGNvbmNhdChcbiAgICAgIG91dGJvdW5kQnVzLFxuICAgICAgLy8gQWRkIGFuIEVuZCBtZXNzYWdlIGF0IGNvbXBsZXRpb24uIFRoaXMgd2lsbCBiZSBmaWx0ZXJlZCBvdXQgaWYgdGhlIGpvYiBhY3R1YWxseSBzZW5kIGFuXG4gICAgICAvLyBFbmQuXG4gICAgICBoYW5kbGVyLnBpcGUoXG4gICAgICAgIHN3aXRjaE1hcCgoaGFuZGxlcikgPT4ge1xuICAgICAgICAgIGlmIChoYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gb2Y8Sm9iT3V0Ym91bmRNZXNzYWdlPE8+Pih7XG4gICAgICAgICAgICAgIGtpbmQ6IEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuRW5kLFxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogaGFuZGxlci5qb2JEZXNjcmlwdGlvbixcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gRU1QVFkgYXMgT2JzZXJ2YWJsZTxKb2JPdXRib3VuZE1lc3NhZ2U8Tz4+O1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApLFxuICAgICkucGlwZShcbiAgICAgIGZpbHRlcigobWVzc2FnZSkgPT4gdGhpcy5fZmlsdGVySm9iT3V0Ym91bmRNZXNzYWdlcyhtZXNzYWdlLCBzdGF0ZSkpLFxuICAgICAgLy8gVXBkYXRlIGludGVybmFsIGxvZ2ljIGFuZCBKb2I8PiBtZW1iZXJzLlxuICAgICAgdGFwKFxuICAgICAgICAobWVzc2FnZSkgPT4ge1xuICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgc3RhdGUuXG4gICAgICAgICAgc3RhdGUgPSB0aGlzLl91cGRhdGVTdGF0ZShtZXNzYWdlLCBzdGF0ZSk7XG5cbiAgICAgICAgICBzd2l0Y2ggKG1lc3NhZ2Uua2luZCkge1xuICAgICAgICAgICAgY2FzZSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLkNoYW5uZWxDcmVhdGU6IHtcbiAgICAgICAgICAgICAgY29uc3QgbWF5YmVTdWJqZWN0ID0gY2hhbm5lbHNTdWJqZWN0LmdldChtZXNzYWdlLm5hbWUpO1xuICAgICAgICAgICAgICAvLyBJZiBpdCBkb2Vzbid0IGV4aXN0IG9yIGl0J3MgY2xvc2VkIG9uIHRoZSBvdGhlciBlbmQuXG4gICAgICAgICAgICAgIGlmICghbWF5YmVTdWJqZWN0KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IG5ldyBTdWJqZWN0PEpzb25WYWx1ZT4oKTtcbiAgICAgICAgICAgICAgICBjaGFubmVsc1N1YmplY3Quc2V0KG1lc3NhZ2UubmFtZSwgcyk7XG4gICAgICAgICAgICAgICAgY2hhbm5lbHMuc2V0KG1lc3NhZ2UubmFtZSwgcy5hc09ic2VydmFibGUoKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNhc2UgSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5DaGFubmVsTWVzc2FnZToge1xuICAgICAgICAgICAgICBjb25zdCBtYXliZVN1YmplY3QgPSBjaGFubmVsc1N1YmplY3QuZ2V0KG1lc3NhZ2UubmFtZSk7XG4gICAgICAgICAgICAgIGlmIChtYXliZVN1YmplY3QpIHtcbiAgICAgICAgICAgICAgICBtYXliZVN1YmplY3QubmV4dChtZXNzYWdlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYXNlIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuQ2hhbm5lbENvbXBsZXRlOiB7XG4gICAgICAgICAgICAgIGNvbnN0IG1heWJlU3ViamVjdCA9IGNoYW5uZWxzU3ViamVjdC5nZXQobWVzc2FnZS5uYW1lKTtcbiAgICAgICAgICAgICAgaWYgKG1heWJlU3ViamVjdCkge1xuICAgICAgICAgICAgICAgIG1heWJlU3ViamVjdC5jb21wbGV0ZSgpO1xuICAgICAgICAgICAgICAgIGNoYW5uZWxzU3ViamVjdC5kZWxldGUobWVzc2FnZS5uYW1lKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2FzZSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLkNoYW5uZWxFcnJvcjoge1xuICAgICAgICAgICAgICBjb25zdCBtYXliZVN1YmplY3QgPSBjaGFubmVsc1N1YmplY3QuZ2V0KG1lc3NhZ2UubmFtZSk7XG4gICAgICAgICAgICAgIGlmIChtYXliZVN1YmplY3QpIHtcbiAgICAgICAgICAgICAgICBtYXliZVN1YmplY3QuZXJyb3IobWVzc2FnZS5lcnJvcik7XG4gICAgICAgICAgICAgICAgY2hhbm5lbHNTdWJqZWN0LmRlbGV0ZShtZXNzYWdlLm5hbWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHN0YXRlID0gSm9iU3RhdGUuRXJyb3JlZDtcbiAgICAgICAgfSxcbiAgICAgICksXG5cbiAgICAgIC8vIERvIG91dHB1dCB2YWxpZGF0aW9uIChtaWdodCBpbmNsdWRlIGRlZmF1bHQgdmFsdWVzIHNvIHRoaXMgbWlnaHQgaGF2ZSBzaWRlXG4gICAgICAvLyBlZmZlY3RzKS4gV2Uga2VlcCBhbGwgbWVzc2FnZXMgaW4gb3JkZXIuXG4gICAgICBjb25jYXRNYXAoKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgaWYgKG1lc3NhZ2Uua2luZCAhPT0gSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5PdXRwdXQpIHtcbiAgICAgICAgICByZXR1cm4gb2YobWVzc2FnZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaGFuZGxlci5waXBlKFxuICAgICAgICAgIHN3aXRjaE1hcChhc3luYyAoaGFuZGxlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGhhbmRsZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEpvYkRvZXNOb3RFeGlzdEV4Y2VwdGlvbihuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHZhbGlkYXRlID0gYXdhaXQgaGFuZGxlci5vdXRwdXRWO1xuICAgICAgICAgICAgY29uc3Qgb3V0cHV0ID0gYXdhaXQgdmFsaWRhdGUobWVzc2FnZS52YWx1ZSk7XG4gICAgICAgICAgICBpZiAoIW91dHB1dC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBKb2JPdXRwdXRTY2hlbWFWYWxpZGF0aW9uRXJyb3Iob3V0cHV0LmVycm9ycyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLm1lc3NhZ2UsXG4gICAgICAgICAgICAgIG91dHB1dDogb3V0cHV0LmRhdGEgYXMgTyxcbiAgICAgICAgICAgIH0gYXMgSm9iT3V0Ym91bmRNZXNzYWdlT3V0cHV0PE8+O1xuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIE9ic2VydmFibGU8Sm9iT3V0Ym91bmRNZXNzYWdlPE8+PjtcbiAgICAgIH0pLFxuICAgICAgX2pvYlNoYXJlKCksXG4gICAgKTtcblxuICAgIGNvbnN0IG91dHB1dCA9IG91dGJvdW5kQnVzLnBpcGUoXG4gICAgICBmaWx0ZXIoKHgpID0+IHgua2luZCA9PSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLk91dHB1dCksXG4gICAgICBtYXAoKHgpID0+ICh4IGFzIEpvYk91dGJvdW5kTWVzc2FnZU91dHB1dDxPPikudmFsdWUpLFxuICAgICAgc2hhcmVSZXBsYXkoMSksXG4gICAgKTtcblxuICAgIC8vIFJldHVybiB0aGUgSm9iLlxuICAgIHJldHVybiB7XG4gICAgICBnZXQgc3RhdGUoKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgIH0sXG4gICAgICBhcmd1bWVudCxcbiAgICAgIGRlc2NyaXB0aW9uOiBoYW5kbGVyLnBpcGUoXG4gICAgICAgIHN3aXRjaE1hcCgoaGFuZGxlcikgPT4ge1xuICAgICAgICAgIGlmIChoYW5kbGVyID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSm9iRG9lc05vdEV4aXN0RXhjZXB0aW9uKG5hbWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gb2YoaGFuZGxlci5qb2JEZXNjcmlwdGlvbik7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICksXG4gICAgICBvdXRwdXQsXG4gICAgICBnZXRDaGFubmVsPFQgZXh0ZW5kcyBKc29uVmFsdWU+KFxuICAgICAgICBuYW1lOiBKb2JOYW1lLFxuICAgICAgICBzY2hlbWE6IHNjaGVtYS5Kc29uU2NoZW1hID0gdHJ1ZSxcbiAgICAgICk6IE9ic2VydmFibGU8VD4ge1xuICAgICAgICBsZXQgbWF5YmVPYnNlcnZhYmxlID0gY2hhbm5lbHMuZ2V0KG5hbWUpO1xuICAgICAgICBpZiAoIW1heWJlT2JzZXJ2YWJsZSkge1xuICAgICAgICAgIGNvbnN0IHMgPSBuZXcgU3ViamVjdDxUPigpO1xuICAgICAgICAgIGNoYW5uZWxzU3ViamVjdC5zZXQobmFtZSwgcyBhcyB1bmtub3duIGFzIFN1YmplY3Q8SnNvblZhbHVlPik7XG4gICAgICAgICAgY2hhbm5lbHMuc2V0KG5hbWUsIHMuYXNPYnNlcnZhYmxlKCkpO1xuXG4gICAgICAgICAgbWF5YmVPYnNlcnZhYmxlID0gcy5hc09ic2VydmFibGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYXliZU9ic2VydmFibGUucGlwZShcbiAgICAgICAgICAvLyBLZWVwIHRoZSBvcmRlciBvZiBtZXNzYWdlcy5cbiAgICAgICAgICBjb25jYXRNYXAoKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBmcm9tKHNjaGVtYVJlZ2lzdHJ5LmNvbXBpbGUoc2NoZW1hKSkucGlwZShcbiAgICAgICAgICAgICAgc3dpdGNoTWFwKCh2YWxpZGF0ZSkgPT4gdmFsaWRhdGUobWVzc2FnZSkpLFxuICAgICAgICAgICAgICBmaWx0ZXIoKHgpID0+IHguc3VjY2VzcyksXG4gICAgICAgICAgICAgIG1hcCgoeCkgPT4geC5kYXRhIGFzIFQpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgICBwaW5nKCkge1xuICAgICAgICBjb25zdCBpZCA9IHBpbmdJZCsrO1xuICAgICAgICBpbmJvdW5kQnVzLm5leHQoeyBraW5kOiBKb2JJbmJvdW5kTWVzc2FnZUtpbmQuUGluZywgaWQgfSk7XG5cbiAgICAgICAgcmV0dXJuIG91dGJvdW5kQnVzLnBpcGUoXG4gICAgICAgICAgZmlsdGVyKCh4KSA9PiB4LmtpbmQgPT09IEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuUG9uZyAmJiB4LmlkID09IGlkKSxcbiAgICAgICAgICBmaXJzdCgpLFxuICAgICAgICAgIGlnbm9yZUVsZW1lbnRzKCksXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICAgc3RvcCgpIHtcbiAgICAgICAgaW5ib3VuZEJ1cy5uZXh0KHsga2luZDogSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLlN0b3AgfSk7XG4gICAgICB9LFxuICAgICAgaW5wdXQsXG4gICAgICBpbmJvdW5kQnVzLFxuICAgICAgb3V0Ym91bmRCdXMsXG4gICAgfTtcbiAgfVxuXG4gIHByb3RlY3RlZCBfc2NoZWR1bGVKb2I8XG4gICAgQSBleHRlbmRzIE1pbmltdW1Bcmd1bWVudFQsXG4gICAgSSBleHRlbmRzIE1pbmltdW1JbnB1dFQsXG4gICAgTyBleHRlbmRzIE1pbmltdW1PdXRwdXRULFxuICA+KFxuICAgIG5hbWU6IEpvYk5hbWUsXG4gICAgYXJndW1lbnQ6IEEsXG4gICAgb3B0aW9uczogU2NoZWR1bGVKb2JPcHRpb25zLFxuICAgIHdhaXRhYmxlOiBPYnNlcnZhYmxlPG5ldmVyPixcbiAgKTogSm9iPEEsIEksIE8+IHtcbiAgICAvLyBHZXQgaGFuZGxlciBmaXJzdCwgc2luY2UgdGhpcyBjYW4gZXJyb3Igb3V0IGlmIHRoZXJlJ3Mgbm8gaGFuZGxlciBmb3IgdGhlIGpvYiBuYW1lLlxuICAgIGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9nZXRJbnRlcm5hbERlc2NyaXB0aW9uKG5hbWUpO1xuXG4gICAgY29uc3Qgb3B0aW9uc0RlcHMgPSAob3B0aW9ucyAmJiBvcHRpb25zLmRlcGVuZGVuY2llcykgfHwgW107XG4gICAgY29uc3QgZGVwZW5kZW5jaWVzID0gQXJyYXkuaXNBcnJheShvcHRpb25zRGVwcykgPyBvcHRpb25zRGVwcyA6IFtvcHRpb25zRGVwc107XG5cbiAgICBjb25zdCBpbmJvdW5kQnVzID0gbmV3IFN1YmplY3Q8Sm9iSW5ib3VuZE1lc3NhZ2U8ST4+KCk7XG4gICAgY29uc3Qgb3V0Ym91bmRCdXMgPSBjb25jYXQoXG4gICAgICAvLyBXYWl0IGZvciBkZXBlbmRlbmNpZXMsIG1ha2Ugc3VyZSB0byBub3QgcmVwb3J0IG1lc3NhZ2VzIGZyb20gZGVwZW5kZW5jaWVzLiBTdWJzY3JpYmUgdG9cbiAgICAgIC8vIGFsbCBkZXBlbmRlbmNpZXMgYXQgdGhlIHNhbWUgdGltZSBzbyB0aGV5IHJ1biBjb25jdXJyZW50bHkuXG4gICAgICBtZXJnZSguLi5kZXBlbmRlbmNpZXMubWFwKCh4KSA9PiB4Lm91dGJvdW5kQnVzKSkucGlwZShpZ25vcmVFbGVtZW50cygpKSxcblxuICAgICAgLy8gV2FpdCBmb3IgcGF1c2UoKSB0byBjbGVhciAoaWYgbmVjZXNzYXJ5KS5cbiAgICAgIHdhaXRhYmxlLFxuXG4gICAgICBmcm9tKGhhbmRsZXIpLnBpcGUoXG4gICAgICAgIHN3aXRjaE1hcChcbiAgICAgICAgICAoaGFuZGxlcikgPT5cbiAgICAgICAgICAgIG5ldyBPYnNlcnZhYmxlPEpvYk91dGJvdW5kTWVzc2FnZTxPPj4oKHN1YnNjcmliZXI6IE9ic2VydmVyPEpvYk91dGJvdW5kTWVzc2FnZTxPPj4pID0+IHtcbiAgICAgICAgICAgICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEpvYkRvZXNOb3RFeGlzdEV4Y2VwdGlvbihuYW1lKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIFZhbGlkYXRlIHRoZSBhcmd1bWVudC5cbiAgICAgICAgICAgICAgcmV0dXJuIGZyb20oaGFuZGxlci5hcmd1bWVudFYpXG4gICAgICAgICAgICAgICAgLnBpcGUoXG4gICAgICAgICAgICAgICAgICBzd2l0Y2hNYXAoKHZhbGlkYXRlKSA9PiB2YWxpZGF0ZShhcmd1bWVudCkpLFxuICAgICAgICAgICAgICAgICAgc3dpdGNoTWFwKChvdXRwdXQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFvdXRwdXQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBKb2JBcmd1bWVudFNjaGVtYVZhbGlkYXRpb25FcnJvcihvdXRwdXQuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZ3VtZW50OiBBID0gb3V0cHV0LmRhdGEgYXMgQTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVzY3JpcHRpb24gPSBoYW5kbGVyLmpvYkRlc2NyaXB0aW9uO1xuICAgICAgICAgICAgICAgICAgICBzdWJzY3JpYmVyLm5leHQoeyBraW5kOiBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLk9uUmVhZHksIGRlc2NyaXB0aW9uIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgZGVwZW5kZW5jaWVzOiBbLi4uZGVwZW5kZW5jaWVzXSxcbiAgICAgICAgICAgICAgICAgICAgICBpbmJvdW5kQnVzOiBpbmJvdW5kQnVzLmFzT2JzZXJ2YWJsZSgpLFxuICAgICAgICAgICAgICAgICAgICAgIHNjaGVkdWxlcjogdGhpcyBhcyBTY2hlZHVsZXI8TWluaW11bUFyZ3VtZW50VCwgTWluaW11bUlucHV0VCwgTWluaW11bU91dHB1dFQ+LFxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoYW5kbGVyKGFyZ3VtZW50LCBjb250ZXh0KTtcbiAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAuc3Vic2NyaWJlKHN1YnNjcmliZXIgYXMgT2JzZXJ2ZXI8Sm9iT3V0Ym91bmRNZXNzYWdlPEpzb25WYWx1ZT4+KTtcbiAgICAgICAgICAgIH0pLFxuICAgICAgICApLFxuICAgICAgKSxcbiAgICApO1xuXG4gICAgcmV0dXJuIHRoaXMuX2NyZWF0ZUpvYihuYW1lLCBhcmd1bWVudCwgaGFuZGxlciwgaW5ib3VuZEJ1cywgb3V0Ym91bmRCdXMpO1xuICB9XG59XG4iXX0=