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
    _jobRegistry;
    _schemaRegistry;
    _internalJobDescriptionMap = new Map();
    _queue = [];
    _pauseCounter = 0;
    constructor(_jobRegistry, _schemaRegistry = new core_1.schema.CoreSchemaRegistry()) {
        this._jobRegistry = _jobRegistry;
        this._schemaRegistry = _schemaRegistry;
    }
    _getInternalDescription(name) {
        const maybeHandler = this._internalJobDescriptionMap.get(name);
        if (maybeHandler !== undefined) {
            return (0, rxjs_1.of)(maybeHandler);
        }
        const handler = this._jobRegistry.get(name);
        return handler.pipe((0, rxjs_1.switchMap)((handler) => {
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
        return (0, rxjs_1.concat)(this._getInternalDescription(name).pipe((0, rxjs_1.map)((x) => x && x.jobDescription)), (0, rxjs_1.of)(null)).pipe((0, rxjs_1.first)());
    }
    /**
     * Returns true if the job name has been registered.
     * @param name The name of the job.
     * @returns True if the job exists, false otherwise.
     */
    has(name) {
        return this.getDescription(name).pipe((0, rxjs_1.map)((x) => x !== null));
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
            .pipe((0, rxjs_1.concatMap)((message) => handler.pipe((0, rxjs_1.switchMap)(async (handler) => {
            if (handler === null) {
                throw new exception_1.JobDoesNotExistException(name);
            }
            const validator = await handler.inputV;
            return validator(message);
        }))), (0, rxjs_1.filter)((result) => result.success), (0, rxjs_1.map)((result) => result.data))
            .subscribe((value) => inboundBus.next({ kind: api_1.JobInboundMessageKind.Input, value }));
        outboundBus = (0, rxjs_1.concat)(outboundBus, 
        // Add an End message at completion. This will be filtered out if the job actually send an
        // End.
        handler.pipe((0, rxjs_1.switchMap)((handler) => {
            if (handler) {
                return (0, rxjs_1.of)({
                    kind: api_1.JobOutboundMessageKind.End,
                    description: handler.jobDescription,
                });
            }
            else {
                return rxjs_1.EMPTY;
            }
        }))).pipe((0, rxjs_1.filter)((message) => this._filterJobOutboundMessages(message, state)), 
        // Update internal logic and Job<> members.
        (0, rxjs_1.tap)((message) => {
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
        (0, rxjs_1.concatMap)((message) => {
            if (message.kind !== api_1.JobOutboundMessageKind.Output) {
                return (0, rxjs_1.of)(message);
            }
            return handler.pipe((0, rxjs_1.switchMap)(async (handler) => {
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
        const output = outboundBus.pipe((0, rxjs_1.filter)((x) => x.kind == api_1.JobOutboundMessageKind.Output), (0, rxjs_1.map)((x) => x.value), (0, rxjs_1.shareReplay)(1));
        // Return the Job.
        return {
            get state() {
                return state;
            },
            argument,
            description: handler.pipe((0, rxjs_1.switchMap)((handler) => {
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
                (0, rxjs_1.concatMap)((message) => {
                    return (0, rxjs_1.from)(schemaRegistry.compile(schema)).pipe((0, rxjs_1.switchMap)((validate) => validate(message)), (0, rxjs_1.filter)((x) => x.success), (0, rxjs_1.map)((x) => x.data));
                }));
            },
            ping() {
                const id = pingId++;
                inboundBus.next({ kind: api_1.JobInboundMessageKind.Ping, id });
                return outboundBus.pipe((0, rxjs_1.filter)((x) => x.kind === api_1.JobOutboundMessageKind.Pong && x.id == id), (0, rxjs_1.first)(), (0, rxjs_1.ignoreElements)());
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
        (0, rxjs_1.merge)(...dependencies.map((x) => x.outboundBus)).pipe((0, rxjs_1.ignoreElements)()), 
        // Wait for pause() to clear (if necessary).
        waitable, (0, rxjs_1.from)(handler).pipe((0, rxjs_1.switchMap)((handler) => new rxjs_1.Observable((subscriber) => {
            if (!handler) {
                throw new exception_1.JobDoesNotExistException(name);
            }
            // Validate the argument.
            return (0, rxjs_1.from)(handler.argumentV)
                .pipe((0, rxjs_1.switchMap)((validate) => validate(argument)), (0, rxjs_1.switchMap)((output) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlLXNjaGVkdWxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2FyY2hpdGVjdC9zcmMvam9icy9zaW1wbGUtc2NoZWR1bGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7OztBQUVILCtDQUF5RDtBQUN6RCwrQkFtQmM7QUFDZCwrQkFjZTtBQUNmLDJDQUF1RDtBQUV2RCxNQUFhLGdDQUFpQyxTQUFRLGFBQU0sQ0FBQyx5QkFBeUI7SUFDcEYsWUFBWSxNQUFzQztRQUNoRCxLQUFLLENBQUMsTUFBTSxFQUFFLDJDQUEyQyxDQUFDLENBQUM7SUFDN0QsQ0FBQztDQUNGO0FBSkQsNEVBSUM7QUFDRCxNQUFhLHNDQUF1QyxTQUFRLGFBQU0sQ0FBQyx5QkFBeUI7SUFDMUYsWUFBWSxNQUFzQztRQUNoRCxLQUFLLENBQUMsTUFBTSxFQUFFLGtEQUFrRCxDQUFDLENBQUM7SUFDcEUsQ0FBQztDQUNGO0FBSkQsd0ZBSUM7QUFDRCxNQUFhLDhCQUErQixTQUFRLGFBQU0sQ0FBQyx5QkFBeUI7SUFDbEYsWUFBWSxNQUFzQztRQUNoRCxLQUFLLENBQUMsTUFBTSxFQUFFLHlDQUF5QyxDQUFDLENBQUM7SUFDM0QsQ0FBQztDQUNGO0FBSkQsd0VBSUM7QUFVRCxTQUFTLFNBQVM7SUFDaEIsK0ZBQStGO0lBQy9GLGlCQUFpQjtJQUNqQixPQUFPLENBQUMsTUFBcUIsRUFBaUIsRUFBRTtRQUM5QyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDakIsSUFBSSxPQUFtQixDQUFDO1FBQ3hCLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztRQUNyQixJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDdkIsSUFBSSxZQUEwQixDQUFDO1FBRS9CLE9BQU8sSUFBSSxpQkFBVSxDQUFJLENBQUMsVUFBVSxFQUFFLEVBQUU7WUFDdEMsSUFBSSxRQUFzQixDQUFDO1lBQzNCLFFBQVEsRUFBRSxDQUFDO1lBQ1gsSUFBSSxDQUFDLE9BQU8sRUFBRTtnQkFDWixPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUssQ0FBQztnQkFFM0IsUUFBUSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3pDLFlBQVksR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDO29CQUM5QixJQUFJLENBQUMsS0FBSzt3QkFDUixPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUN0QixDQUFDO29CQUNELEtBQUssQ0FBQyxHQUFHO3dCQUNQLFFBQVEsR0FBRyxJQUFJLENBQUM7d0JBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3JCLENBQUM7b0JBQ0QsUUFBUTt3QkFDTixVQUFVLEdBQUcsSUFBSSxDQUFDO3dCQUNsQixPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ3JCLENBQUM7aUJBQ0YsQ0FBQyxDQUFDO2FBQ0o7aUJBQU07Z0JBQ0wsUUFBUSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7YUFDMUM7WUFFRCxPQUFPLEdBQUcsRUFBRTtnQkFDVixRQUFRLEVBQUUsQ0FBQztnQkFDWCxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksWUFBWSxJQUFJLFFBQVEsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksUUFBUSxDQUFDLEVBQUU7b0JBQzlELFlBQVksQ0FBQyxXQUFXLEVBQUUsQ0FBQztpQkFDNUI7WUFDSCxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQWEsZUFBZTtJQVdkO0lBQ0E7SUFOSiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsRUFBZ0MsQ0FBQztJQUNyRSxNQUFNLEdBQW1CLEVBQUUsQ0FBQztJQUM1QixhQUFhLEdBQUcsQ0FBQyxDQUFDO0lBRTFCLFlBQ1ksWUFBdUUsRUFDdkUsa0JBQXlDLElBQUksYUFBTSxDQUFDLGtCQUFrQixFQUFFO1FBRHhFLGlCQUFZLEdBQVosWUFBWSxDQUEyRDtRQUN2RSxvQkFBZSxHQUFmLGVBQWUsQ0FBeUQ7SUFDakYsQ0FBQztJQUVJLHVCQUF1QixDQUFDLElBQWE7UUFDM0MsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvRCxJQUFJLFlBQVksS0FBSyxTQUFTLEVBQUU7WUFDOUIsT0FBTyxJQUFBLFNBQUUsRUFBQyxZQUFZLENBQUMsQ0FBQztTQUN6QjtRQUVELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFrRCxJQUFJLENBQUMsQ0FBQztRQUU3RixPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQ2pCLElBQUEsZ0JBQVMsRUFBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQ3BCLElBQUksT0FBTyxLQUFLLElBQUksRUFBRTtnQkFDcEIsT0FBTyxJQUFBLFNBQUUsRUFBQyxJQUFJLENBQUMsQ0FBQzthQUNqQjtZQUVELE1BQU0sV0FBVyxHQUFtQjtnQkFDbEMsaURBQWlEO2dCQUNqRCxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ3JELElBQUksRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksSUFBSSxJQUFJO2dCQUN6QyxRQUFRLEVBQUUsT0FBTyxDQUFDLGNBQWMsQ0FBQyxRQUFRLElBQUksSUFBSTtnQkFDakQsS0FBSyxFQUFFLE9BQU8sQ0FBQyxjQUFjLENBQUMsS0FBSyxJQUFJLElBQUk7Z0JBQzNDLE1BQU0sRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFDLE1BQU0sSUFBSSxJQUFJO2dCQUM3QyxRQUFRLEVBQUUsT0FBTyxDQUFDLGNBQWMsQ0FBQyxRQUFRLElBQUksRUFBRTthQUNoRCxDQUFDO1lBRUYsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUU7Z0JBQzlELGNBQWMsRUFBRSxXQUFXO2dCQUMzQixTQUFTLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQztnQkFDN0QsTUFBTSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3ZELE9BQU8sRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDO2FBQzFELENBQXdCLENBQUM7WUFDMUIsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUU1RCxPQUFPLElBQUEsU0FBRSxFQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQ0gsQ0FBQztJQUNKLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILGNBQWMsQ0FBQyxJQUFhO1FBQzFCLE9BQU8sSUFBQSxhQUFNLEVBQ1gsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFBLFVBQUcsRUFBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxFQUMxRSxJQUFBLFNBQUUsRUFBQyxJQUFJLENBQUMsQ0FDVCxDQUFDLElBQUksQ0FBQyxJQUFBLFlBQUssR0FBRSxDQUFDLENBQUM7SUFDbEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxHQUFHLENBQUMsSUFBYTtRQUNmLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBQSxVQUFHLEVBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0gsS0FBSztRQUNILElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFckIsT0FBTyxHQUFHLEVBQUU7WUFDVixJQUFJLENBQUMsTUFBTSxFQUFFO2dCQUNYLE1BQU0sR0FBRyxJQUFJLENBQUM7Z0JBQ2QsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLElBQUksQ0FBQyxFQUFFO29CQUM3QixvQkFBb0I7b0JBQ3BCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7b0JBQ3RCLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO29CQUNqQixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2lCQUN6QjthQUNGO1FBQ0gsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILFFBQVEsQ0FDTixJQUFhLEVBQ2IsUUFBVyxFQUNYLE9BQTRCO1FBRTVCLElBQUksSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLEVBQUU7WUFDMUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxjQUFPLEVBQVMsQ0FBQztZQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUU1QyxPQUFPLElBQUksQ0FBQyxZQUFZLENBQVUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLElBQUksRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQzVFO1FBRUQsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFVLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxJQUFJLEVBQUUsRUFBRSxZQUFLLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssMEJBQTBCLENBQ2hDLE9BQThCLEVBQzlCLEtBQWU7UUFFZixRQUFRLE9BQU8sQ0FBQyxJQUFJLEVBQUU7WUFDcEIsS0FBSyw0QkFBc0IsQ0FBQyxPQUFPO2dCQUNqQyxPQUFPLEtBQUssSUFBSSxjQUFRLENBQUMsTUFBTSxDQUFDO1lBQ2xDLEtBQUssNEJBQXNCLENBQUMsS0FBSztnQkFDL0IsT0FBTyxLQUFLLElBQUksY0FBUSxDQUFDLEtBQUssQ0FBQztZQUVqQyxLQUFLLDRCQUFzQixDQUFDLEdBQUc7Z0JBQzdCLE9BQU8sS0FBSyxJQUFJLGNBQVEsQ0FBQyxPQUFPLElBQUksS0FBSyxJQUFJLGNBQVEsQ0FBQyxLQUFLLENBQUM7U0FDL0Q7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7O09BR0c7SUFDSyxZQUFZLENBQ2xCLE9BQThCLEVBQzlCLEtBQWU7UUFFZixRQUFRLE9BQU8sQ0FBQyxJQUFJLEVBQUU7WUFDcEIsS0FBSyw0QkFBc0IsQ0FBQyxPQUFPO2dCQUNqQyxPQUFPLGNBQVEsQ0FBQyxLQUFLLENBQUM7WUFDeEIsS0FBSyw0QkFBc0IsQ0FBQyxLQUFLO2dCQUMvQixPQUFPLGNBQVEsQ0FBQyxPQUFPLENBQUM7WUFDMUIsS0FBSyw0QkFBc0IsQ0FBQyxHQUFHO2dCQUM3QixPQUFPLGNBQVEsQ0FBQyxLQUFLLENBQUM7U0FDekI7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7SUFFRDs7O09BR0c7SUFDSCxrREFBa0Q7SUFDMUMsVUFBVSxDQUNoQixJQUFhLEVBQ2IsUUFBVyxFQUNYLE9BQStDLEVBQy9DLFVBQTBDLEVBQzFDLFdBQThDO1FBRTlDLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUM7UUFFNUMsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLEVBQThCLENBQUM7UUFDOUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQWlDLENBQUM7UUFFMUQsSUFBSSxLQUFLLEdBQUcsY0FBUSxDQUFDLE1BQU0sQ0FBQztRQUM1QixJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFFZiwrQ0FBK0M7UUFDL0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxjQUFPLEVBQWEsQ0FBQztRQUN2QyxLQUFLO2FBQ0YsSUFBSSxDQUNILElBQUEsZ0JBQVMsRUFBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQ3BCLE9BQU8sQ0FBQyxJQUFJLENBQ1YsSUFBQSxnQkFBUyxFQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRTtZQUMxQixJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUU7Z0JBQ3BCLE1BQU0sSUFBSSxvQ0FBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUMxQztZQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sT0FBTyxDQUFDLE1BQU0sQ0FBQztZQUV2QyxPQUFPLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FDSCxDQUNGLEVBQ0QsSUFBQSxhQUFNLEVBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFDbEMsSUFBQSxVQUFHLEVBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFTLENBQUMsQ0FDbEM7YUFDQSxTQUFTLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsMkJBQXFCLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2RixXQUFXLEdBQUcsSUFBQSxhQUFNLEVBQ2xCLFdBQVc7UUFDWCwwRkFBMEY7UUFDMUYsT0FBTztRQUNQLE9BQU8sQ0FBQyxJQUFJLENBQ1YsSUFBQSxnQkFBUyxFQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDcEIsSUFBSSxPQUFPLEVBQUU7Z0JBQ1gsT0FBTyxJQUFBLFNBQUUsRUFBd0I7b0JBQy9CLElBQUksRUFBRSw0QkFBc0IsQ0FBQyxHQUFHO29CQUNoQyxXQUFXLEVBQUUsT0FBTyxDQUFDLGNBQWM7aUJBQ3BDLENBQUMsQ0FBQzthQUNKO2lCQUFNO2dCQUNMLE9BQU8sWUFBMEMsQ0FBQzthQUNuRDtRQUNILENBQUMsQ0FBQyxDQUNILENBQ0YsQ0FBQyxJQUFJLENBQ0osSUFBQSxhQUFNLEVBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEUsMkNBQTJDO1FBQzNDLElBQUEsVUFBRyxFQUNELENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDVixvQkFBb0I7WUFDcEIsS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTFDLFFBQVEsT0FBTyxDQUFDLElBQUksRUFBRTtnQkFDcEIsS0FBSyw0QkFBc0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDekMsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3ZELHVEQUF1RDtvQkFDdkQsSUFBSSxDQUFDLFlBQVksRUFBRTt3QkFDakIsTUFBTSxDQUFDLEdBQUcsSUFBSSxjQUFPLEVBQWEsQ0FBQzt3QkFDbkMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUNyQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7cUJBQzlDO29CQUNELE1BQU07aUJBQ1A7Z0JBRUQsS0FBSyw0QkFBc0IsQ0FBQyxjQUFjLENBQUMsQ0FBQztvQkFDMUMsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3ZELElBQUksWUFBWSxFQUFFO3dCQUNoQixZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztxQkFDcEM7b0JBQ0QsTUFBTTtpQkFDUDtnQkFFRCxLQUFLLDRCQUFzQixDQUFDLGVBQWUsQ0FBQyxDQUFDO29CQUMzQyxNQUFNLFlBQVksR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDdkQsSUFBSSxZQUFZLEVBQUU7d0JBQ2hCLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQzt3QkFDeEIsZUFBZSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7cUJBQ3RDO29CQUNELE1BQU07aUJBQ1A7Z0JBRUQsS0FBSyw0QkFBc0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDeEMsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3ZELElBQUksWUFBWSxFQUFFO3dCQUNoQixZQUFZLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDbEMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7cUJBQ3RDO29CQUNELE1BQU07aUJBQ1A7YUFDRjtRQUNILENBQUMsRUFDRCxHQUFHLEVBQUU7WUFDSCxLQUFLLEdBQUcsY0FBUSxDQUFDLE9BQU8sQ0FBQztRQUMzQixDQUFDLENBQ0Y7UUFFRCw2RUFBNkU7UUFDN0UsMkNBQTJDO1FBQzNDLElBQUEsZ0JBQVMsRUFBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQ3BCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyw0QkFBc0IsQ0FBQyxNQUFNLEVBQUU7Z0JBQ2xELE9BQU8sSUFBQSxTQUFFLEVBQUMsT0FBTyxDQUFDLENBQUM7YUFDcEI7WUFFRCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQ2pCLElBQUEsZ0JBQVMsRUFBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7Z0JBQzFCLElBQUksT0FBTyxLQUFLLElBQUksRUFBRTtvQkFDcEIsTUFBTSxJQUFJLG9DQUF3QixDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUMxQztnQkFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUM7Z0JBQ3ZDLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUU7b0JBQ25CLE1BQU0sSUFBSSw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7aUJBQ3pEO2dCQUVELE9BQU87b0JBQ0wsR0FBRyxPQUFPO29CQUNWLE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBUztpQkFDTSxDQUFDO1lBQ25DLENBQUMsQ0FBQyxDQUNrQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxFQUNGLFNBQVMsRUFBRSxDQUNaLENBQUM7UUFFRixNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsSUFBSSxDQUM3QixJQUFBLGFBQU0sRUFBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSw0QkFBc0IsQ0FBQyxNQUFNLENBQUMsRUFDdEQsSUFBQSxVQUFHLEVBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFFLENBQWlDLENBQUMsS0FBSyxDQUFDLEVBQ3BELElBQUEsa0JBQVcsRUFBQyxDQUFDLENBQUMsQ0FDZixDQUFDO1FBRUYsa0JBQWtCO1FBQ2xCLE9BQU87WUFDTCxJQUFJLEtBQUs7Z0JBQ1AsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1lBQ0QsUUFBUTtZQUNSLFdBQVcsRUFBRSxPQUFPLENBQUMsSUFBSSxDQUN2QixJQUFBLGdCQUFTLEVBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtnQkFDcEIsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFO29CQUNwQixNQUFNLElBQUksb0NBQXdCLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQzFDO3FCQUFNO29CQUNMLE9BQU8sSUFBQSxTQUFFLEVBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2lCQUNuQztZQUNILENBQUMsQ0FBQyxDQUNIO1lBQ0QsTUFBTTtZQUNOLFVBQVUsQ0FDUixJQUFhLEVBQ2IsU0FBNEIsSUFBSTtnQkFFaEMsSUFBSSxlQUFlLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDekMsSUFBSSxDQUFDLGVBQWUsRUFBRTtvQkFDcEIsTUFBTSxDQUFDLEdBQUcsSUFBSSxjQUFPLEVBQUssQ0FBQztvQkFDM0IsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBa0MsQ0FBQyxDQUFDO29CQUM5RCxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztvQkFFckMsZUFBZSxHQUFHLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztpQkFDcEM7Z0JBRUQsT0FBTyxlQUFlLENBQUMsSUFBSTtnQkFDekIsOEJBQThCO2dCQUM5QixJQUFBLGdCQUFTLEVBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtvQkFDcEIsT0FBTyxJQUFBLFdBQUksRUFBQyxjQUFjLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUM5QyxJQUFBLGdCQUFTLEVBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUMxQyxJQUFBLGFBQU0sRUFBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUN4QixJQUFBLFVBQUcsRUFBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQVMsQ0FBQyxDQUN4QixDQUFDO2dCQUNKLENBQUMsQ0FBQyxDQUNILENBQUM7WUFDSixDQUFDO1lBQ0QsSUFBSTtnQkFDRixNQUFNLEVBQUUsR0FBRyxNQUFNLEVBQUUsQ0FBQztnQkFDcEIsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSwyQkFBcUIsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFFMUQsT0FBTyxXQUFXLENBQUMsSUFBSSxDQUNyQixJQUFBLGFBQU0sRUFBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyw0QkFBc0IsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFDbkUsSUFBQSxZQUFLLEdBQUUsRUFDUCxJQUFBLHFCQUFjLEdBQUUsQ0FDakIsQ0FBQztZQUNKLENBQUM7WUFDRCxJQUFJO2dCQUNGLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsMkJBQXFCLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUN4RCxDQUFDO1lBQ0QsS0FBSztZQUNMLFVBQVU7WUFDVixXQUFXO1NBQ1osQ0FBQztJQUNKLENBQUM7SUFFUyxZQUFZLENBS3BCLElBQWEsRUFDYixRQUFXLEVBQ1gsT0FBMkIsRUFDM0IsUUFBMkI7UUFFM0Isc0ZBQXNGO1FBQ3RGLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVuRCxNQUFNLFdBQVcsR0FBRyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzVELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU5RSxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQU8sRUFBd0IsQ0FBQztRQUN2RCxNQUFNLFdBQVcsR0FBRyxJQUFBLGFBQU07UUFDeEIsMEZBQTBGO1FBQzFGLDhEQUE4RDtRQUM5RCxJQUFBLFlBQUssRUFBQyxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFBLHFCQUFjLEdBQUUsQ0FBQztRQUV2RSw0Q0FBNEM7UUFDNUMsUUFBUSxFQUVSLElBQUEsV0FBSSxFQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FDaEIsSUFBQSxnQkFBUyxFQUNQLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FDVixJQUFJLGlCQUFVLENBQXdCLENBQUMsVUFBMkMsRUFBRSxFQUFFO1lBQ3BGLElBQUksQ0FBQyxPQUFPLEVBQUU7Z0JBQ1osTUFBTSxJQUFJLG9DQUF3QixDQUFDLElBQUksQ0FBQyxDQUFDO2FBQzFDO1lBRUQseUJBQXlCO1lBQ3pCLE9BQU8sSUFBQSxXQUFJLEVBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQztpQkFDM0IsSUFBSSxDQUNILElBQUEsZ0JBQVMsRUFBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQzNDLElBQUEsZ0JBQVMsRUFBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUNuQixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRTtvQkFDbkIsTUFBTSxJQUFJLGdDQUFnQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztpQkFDM0Q7Z0JBRUQsTUFBTSxRQUFRLEdBQU0sTUFBTSxDQUFDLElBQVMsQ0FBQztnQkFDckMsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQztnQkFDM0MsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSw0QkFBc0IsQ0FBQyxPQUFPLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztnQkFFdkUsTUFBTSxPQUFPLEdBQUc7b0JBQ2QsV0FBVztvQkFDWCxZQUFZLEVBQUUsQ0FBQyxHQUFHLFlBQVksQ0FBQztvQkFDL0IsVUFBVSxFQUFFLFVBQVUsQ0FBQyxZQUFZLEVBQUU7b0JBQ3JDLFNBQVMsRUFBRSxJQUFrRTtpQkFDOUUsQ0FBQztnQkFFRixPQUFPLE9BQU8sQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEMsQ0FBQyxDQUFDLENBQ0g7aUJBQ0EsU0FBUyxDQUFDLFVBQXFELENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FDTCxDQUNGLENBQ0YsQ0FBQztRQUVGLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDM0UsQ0FBQztDQUNGO0FBN2FELDBDQTZhQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBKc29uVmFsdWUsIHNjaGVtYSB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7XG4gIEVNUFRZLFxuICBNb25vVHlwZU9wZXJhdG9yRnVuY3Rpb24sXG4gIE9ic2VydmFibGUsXG4gIE9ic2VydmVyLFxuICBTdWJqZWN0LFxuICBTdWJzY3JpcHRpb24sXG4gIGNvbmNhdCxcbiAgY29uY2F0TWFwLFxuICBmaWx0ZXIsXG4gIGZpcnN0LFxuICBmcm9tLFxuICBpZ25vcmVFbGVtZW50cyxcbiAgbWFwLFxuICBtZXJnZSxcbiAgb2YsXG4gIHNoYXJlUmVwbGF5LFxuICBzd2l0Y2hNYXAsXG4gIHRhcCxcbn0gZnJvbSAncnhqcyc7XG5pbXBvcnQge1xuICBKb2IsXG4gIEpvYkRlc2NyaXB0aW9uLFxuICBKb2JIYW5kbGVyLFxuICBKb2JJbmJvdW5kTWVzc2FnZSxcbiAgSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLFxuICBKb2JOYW1lLFxuICBKb2JPdXRib3VuZE1lc3NhZ2UsXG4gIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQsXG4gIEpvYk91dGJvdW5kTWVzc2FnZU91dHB1dCxcbiAgSm9iU3RhdGUsXG4gIFJlZ2lzdHJ5LFxuICBTY2hlZHVsZUpvYk9wdGlvbnMsXG4gIFNjaGVkdWxlcixcbn0gZnJvbSAnLi9hcGknO1xuaW1wb3J0IHsgSm9iRG9lc05vdEV4aXN0RXhjZXB0aW9uIH0gZnJvbSAnLi9leGNlcHRpb24nO1xuXG5leHBvcnQgY2xhc3MgSm9iQXJndW1lbnRTY2hlbWFWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBzY2hlbWEuU2NoZW1hVmFsaWRhdGlvbkV4Y2VwdGlvbiB7XG4gIGNvbnN0cnVjdG9yKGVycm9ycz86IHNjaGVtYS5TY2hlbWFWYWxpZGF0b3JFcnJvcltdKSB7XG4gICAgc3VwZXIoZXJyb3JzLCAnSm9iIEFyZ3VtZW50IGZhaWxlZCB0byB2YWxpZGF0ZS4gRXJyb3JzOiAnKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEpvYkluYm91bmRNZXNzYWdlU2NoZW1hVmFsaWRhdGlvbkVycm9yIGV4dGVuZHMgc2NoZW1hLlNjaGVtYVZhbGlkYXRpb25FeGNlcHRpb24ge1xuICBjb25zdHJ1Y3RvcihlcnJvcnM/OiBzY2hlbWEuU2NoZW1hVmFsaWRhdG9yRXJyb3JbXSkge1xuICAgIHN1cGVyKGVycm9ycywgJ0pvYiBJbmJvdW5kIE1lc3NhZ2UgZmFpbGVkIHRvIHZhbGlkYXRlLiBFcnJvcnM6ICcpO1xuICB9XG59XG5leHBvcnQgY2xhc3MgSm9iT3V0cHV0U2NoZW1hVmFsaWRhdGlvbkVycm9yIGV4dGVuZHMgc2NoZW1hLlNjaGVtYVZhbGlkYXRpb25FeGNlcHRpb24ge1xuICBjb25zdHJ1Y3RvcihlcnJvcnM/OiBzY2hlbWEuU2NoZW1hVmFsaWRhdG9yRXJyb3JbXSkge1xuICAgIHN1cGVyKGVycm9ycywgJ0pvYiBPdXRwdXQgZmFpbGVkIHRvIHZhbGlkYXRlLiBFcnJvcnM6ICcpO1xuICB9XG59XG5cbmludGVyZmFjZSBKb2JIYW5kbGVyV2l0aEV4dHJhIGV4dGVuZHMgSm9iSGFuZGxlcjxKc29uVmFsdWUsIEpzb25WYWx1ZSwgSnNvblZhbHVlPiB7XG4gIGpvYkRlc2NyaXB0aW9uOiBKb2JEZXNjcmlwdGlvbjtcblxuICBhcmd1bWVudFY6IFByb21pc2U8c2NoZW1hLlNjaGVtYVZhbGlkYXRvcj47XG4gIG91dHB1dFY6IFByb21pc2U8c2NoZW1hLlNjaGVtYVZhbGlkYXRvcj47XG4gIGlucHV0VjogUHJvbWlzZTxzY2hlbWEuU2NoZW1hVmFsaWRhdG9yPjtcbn1cblxuZnVuY3Rpb24gX2pvYlNoYXJlPFQ+KCk6IE1vbm9UeXBlT3BlcmF0b3JGdW5jdGlvbjxUPiB7XG4gIC8vIFRoaXMgaXMgdGhlIHNhbWUgY29kZSBhcyBhIGBzaGFyZVJlcGxheSgpYCBvcGVyYXRvciwgYnV0IHVzZXMgYSBkdW1iZXIgU3ViamVjdCByYXRoZXIgdGhhbiBhXG4gIC8vIFJlcGxheVN1YmplY3QuXG4gIHJldHVybiAoc291cmNlOiBPYnNlcnZhYmxlPFQ+KTogT2JzZXJ2YWJsZTxUPiA9PiB7XG4gICAgbGV0IHJlZkNvdW50ID0gMDtcbiAgICBsZXQgc3ViamVjdDogU3ViamVjdDxUPjtcbiAgICBsZXQgaGFzRXJyb3IgPSBmYWxzZTtcbiAgICBsZXQgaXNDb21wbGV0ZSA9IGZhbHNlO1xuICAgIGxldCBzdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbjtcblxuICAgIHJldHVybiBuZXcgT2JzZXJ2YWJsZTxUPigoc3Vic2NyaWJlcikgPT4ge1xuICAgICAgbGV0IGlubmVyU3ViOiBTdWJzY3JpcHRpb247XG4gICAgICByZWZDb3VudCsrO1xuICAgICAgaWYgKCFzdWJqZWN0KSB7XG4gICAgICAgIHN1YmplY3QgPSBuZXcgU3ViamVjdDxUPigpO1xuXG4gICAgICAgIGlubmVyU3ViID0gc3ViamVjdC5zdWJzY3JpYmUoc3Vic2NyaWJlcik7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IHNvdXJjZS5zdWJzY3JpYmUoe1xuICAgICAgICAgIG5leHQodmFsdWUpIHtcbiAgICAgICAgICAgIHN1YmplY3QubmV4dCh2YWx1ZSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBlcnJvcihlcnIpIHtcbiAgICAgICAgICAgIGhhc0Vycm9yID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1YmplY3QuZXJyb3IoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbXBsZXRlKCkge1xuICAgICAgICAgICAgaXNDb21wbGV0ZSA9IHRydWU7XG4gICAgICAgICAgICBzdWJqZWN0LmNvbXBsZXRlKCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbm5lclN1YiA9IHN1YmplY3Quc3Vic2NyaWJlKHN1YnNjcmliZXIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICByZWZDb3VudC0tO1xuICAgICAgICBpbm5lclN1Yi51bnN1YnNjcmliZSgpO1xuICAgICAgICBpZiAoc3Vic2NyaXB0aW9uICYmIHJlZkNvdW50ID09PSAwICYmIChpc0NvbXBsZXRlIHx8IGhhc0Vycm9yKSkge1xuICAgICAgICAgIHN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xufVxuXG4vKipcbiAqIFNpbXBsZSBzY2hlZHVsZXIuIFNob3VsZCBiZSB0aGUgYmFzZSBvZiBhbGwgcmVnaXN0cmllcyBhbmQgc2NoZWR1bGVycy5cbiAqL1xuZXhwb3J0IGNsYXNzIFNpbXBsZVNjaGVkdWxlcjxcbiAgTWluaW11bUFyZ3VtZW50VCBleHRlbmRzIEpzb25WYWx1ZSA9IEpzb25WYWx1ZSxcbiAgTWluaW11bUlucHV0VCBleHRlbmRzIEpzb25WYWx1ZSA9IEpzb25WYWx1ZSxcbiAgTWluaW11bU91dHB1dFQgZXh0ZW5kcyBKc29uVmFsdWUgPSBKc29uVmFsdWUsXG4+IGltcGxlbWVudHMgU2NoZWR1bGVyPE1pbmltdW1Bcmd1bWVudFQsIE1pbmltdW1JbnB1dFQsIE1pbmltdW1PdXRwdXRUPlxue1xuICBwcml2YXRlIF9pbnRlcm5hbEpvYkRlc2NyaXB0aW9uTWFwID0gbmV3IE1hcDxKb2JOYW1lLCBKb2JIYW5kbGVyV2l0aEV4dHJhPigpO1xuICBwcml2YXRlIF9xdWV1ZTogKCgpID0+IHZvaWQpW10gPSBbXTtcbiAgcHJpdmF0ZSBfcGF1c2VDb3VudGVyID0gMDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcm90ZWN0ZWQgX2pvYlJlZ2lzdHJ5OiBSZWdpc3RyeTxNaW5pbXVtQXJndW1lbnRULCBNaW5pbXVtSW5wdXRULCBNaW5pbXVtT3V0cHV0VD4sXG4gICAgcHJvdGVjdGVkIF9zY2hlbWFSZWdpc3RyeTogc2NoZW1hLlNjaGVtYVJlZ2lzdHJ5ID0gbmV3IHNjaGVtYS5Db3JlU2NoZW1hUmVnaXN0cnkoKSxcbiAgKSB7fVxuXG4gIHByaXZhdGUgX2dldEludGVybmFsRGVzY3JpcHRpb24obmFtZTogSm9iTmFtZSk6IE9ic2VydmFibGU8Sm9iSGFuZGxlcldpdGhFeHRyYSB8IG51bGw+IHtcbiAgICBjb25zdCBtYXliZUhhbmRsZXIgPSB0aGlzLl9pbnRlcm5hbEpvYkRlc2NyaXB0aW9uTWFwLmdldChuYW1lKTtcbiAgICBpZiAobWF5YmVIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBvZihtYXliZUhhbmRsZXIpO1xuICAgIH1cblxuICAgIGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9qb2JSZWdpc3RyeS5nZXQ8TWluaW11bUFyZ3VtZW50VCwgTWluaW11bUlucHV0VCwgTWluaW11bU91dHB1dFQ+KG5hbWUpO1xuXG4gICAgcmV0dXJuIGhhbmRsZXIucGlwZShcbiAgICAgIHN3aXRjaE1hcCgoaGFuZGxlcikgPT4ge1xuICAgICAgICBpZiAoaGFuZGxlciA9PT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBvZihudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGRlc2NyaXB0aW9uOiBKb2JEZXNjcmlwdGlvbiA9IHtcbiAgICAgICAgICAvLyBNYWtlIGEgY29weSBvZiBpdCB0byBiZSBzdXJlIGl0J3MgcHJvcGVyIEpTT04uXG4gICAgICAgICAgLi4uSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShoYW5kbGVyLmpvYkRlc2NyaXB0aW9uKSksXG4gICAgICAgICAgbmFtZTogaGFuZGxlci5qb2JEZXNjcmlwdGlvbi5uYW1lIHx8IG5hbWUsXG4gICAgICAgICAgYXJndW1lbnQ6IGhhbmRsZXIuam9iRGVzY3JpcHRpb24uYXJndW1lbnQgfHwgdHJ1ZSxcbiAgICAgICAgICBpbnB1dDogaGFuZGxlci5qb2JEZXNjcmlwdGlvbi5pbnB1dCB8fCB0cnVlLFxuICAgICAgICAgIG91dHB1dDogaGFuZGxlci5qb2JEZXNjcmlwdGlvbi5vdXRwdXQgfHwgdHJ1ZSxcbiAgICAgICAgICBjaGFubmVsczogaGFuZGxlci5qb2JEZXNjcmlwdGlvbi5jaGFubmVscyB8fCB7fSxcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBoYW5kbGVyV2l0aEV4dHJhID0gT2JqZWN0LmFzc2lnbihoYW5kbGVyLmJpbmQodW5kZWZpbmVkKSwge1xuICAgICAgICAgIGpvYkRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbixcbiAgICAgICAgICBhcmd1bWVudFY6IHRoaXMuX3NjaGVtYVJlZ2lzdHJ5LmNvbXBpbGUoZGVzY3JpcHRpb24uYXJndW1lbnQpLFxuICAgICAgICAgIGlucHV0VjogdGhpcy5fc2NoZW1hUmVnaXN0cnkuY29tcGlsZShkZXNjcmlwdGlvbi5pbnB1dCksXG4gICAgICAgICAgb3V0cHV0VjogdGhpcy5fc2NoZW1hUmVnaXN0cnkuY29tcGlsZShkZXNjcmlwdGlvbi5vdXRwdXQpLFxuICAgICAgICB9KSBhcyBKb2JIYW5kbGVyV2l0aEV4dHJhO1xuICAgICAgICB0aGlzLl9pbnRlcm5hbEpvYkRlc2NyaXB0aW9uTWFwLnNldChuYW1lLCBoYW5kbGVyV2l0aEV4dHJhKTtcblxuICAgICAgICByZXR1cm4gb2YoaGFuZGxlcldpdGhFeHRyYSk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhIGpvYiBkZXNjcmlwdGlvbiBmb3IgYSBuYW1lZCBqb2IuXG4gICAqXG4gICAqIEBwYXJhbSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBqb2IuXG4gICAqIEByZXR1cm5zIEEgZGVzY3JpcHRpb24sIG9yIG51bGwgaWYgdGhlIGpvYiBpcyBub3QgcmVnaXN0ZXJlZC5cbiAgICovXG4gIGdldERlc2NyaXB0aW9uKG5hbWU6IEpvYk5hbWUpIHtcbiAgICByZXR1cm4gY29uY2F0KFxuICAgICAgdGhpcy5fZ2V0SW50ZXJuYWxEZXNjcmlwdGlvbihuYW1lKS5waXBlKG1hcCgoeCkgPT4geCAmJiB4LmpvYkRlc2NyaXB0aW9uKSksXG4gICAgICBvZihudWxsKSxcbiAgICApLnBpcGUoZmlyc3QoKSk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0cnVlIGlmIHRoZSBqb2IgbmFtZSBoYXMgYmVlbiByZWdpc3RlcmVkLlxuICAgKiBAcGFyYW0gbmFtZSBUaGUgbmFtZSBvZiB0aGUgam9iLlxuICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBqb2IgZXhpc3RzLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBoYXMobmFtZTogSm9iTmFtZSkge1xuICAgIHJldHVybiB0aGlzLmdldERlc2NyaXB0aW9uKG5hbWUpLnBpcGUobWFwKCh4KSA9PiB4ICE9PSBudWxsKSk7XG4gIH1cblxuICAvKipcbiAgICogUGF1c2UgdGhlIHNjaGVkdWxlciwgdGVtcG9yYXJ5IHF1ZXVlaW5nIF9uZXdfIGpvYnMuIFJldHVybnMgYSByZXN1bWUgZnVuY3Rpb24gdGhhdCBzaG91bGQgYmVcbiAgICogdXNlZCB0byByZXN1bWUgZXhlY3V0aW9uLiBJZiBtdWx0aXBsZSBgcGF1c2UoKWAgd2VyZSBjYWxsZWQsIGFsbCB0aGVpciByZXN1bWUgZnVuY3Rpb25zIG11c3RcbiAgICogYmUgY2FsbGVkIGJlZm9yZSB0aGUgU2NoZWR1bGVyIGFjdHVhbGx5IHN0YXJ0cyBuZXcgam9icy4gQWRkaXRpb25hbCBjYWxscyB0byB0aGUgc2FtZSByZXN1bWVcbiAgICogZnVuY3Rpb24gd2lsbCBoYXZlIG5vIGVmZmVjdC5cbiAgICpcbiAgICogSm9icyBhbHJlYWR5IHJ1bm5pbmcgYXJlIE5PVCBwYXVzZWQuIFRoaXMgaXMgcGF1c2luZyB0aGUgc2NoZWR1bGVyIG9ubHkuXG4gICAqL1xuICBwYXVzZSgpIHtcbiAgICBsZXQgY2FsbGVkID0gZmFsc2U7XG4gICAgdGhpcy5fcGF1c2VDb3VudGVyKys7XG5cbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgaWYgKCFjYWxsZWQpIHtcbiAgICAgICAgY2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKC0tdGhpcy5fcGF1c2VDb3VudGVyID09IDApIHtcbiAgICAgICAgICAvLyBSZXN1bWUgdGhlIHF1ZXVlLlxuICAgICAgICAgIGNvbnN0IHEgPSB0aGlzLl9xdWV1ZTtcbiAgICAgICAgICB0aGlzLl9xdWV1ZSA9IFtdO1xuICAgICAgICAgIHEuZm9yRWFjaCgoZm4pID0+IGZuKCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTY2hlZHVsZSBhIGpvYiB0byBiZSBydW4sIHVzaW5nIGl0cyBuYW1lLlxuICAgKiBAcGFyYW0gbmFtZSBUaGUgbmFtZSBvZiBqb2IgdG8gYmUgcnVuLlxuICAgKiBAcGFyYW0gYXJndW1lbnQgVGhlIGFyZ3VtZW50IHRvIHNlbmQgdG8gdGhlIGpvYiB3aGVuIHN0YXJ0aW5nIGl0LlxuICAgKiBAcGFyYW0gb3B0aW9ucyBTY2hlZHVsaW5nIG9wdGlvbnMuXG4gICAqIEByZXR1cm5zIFRoZSBKb2IgYmVpbmcgcnVuLlxuICAgKi9cbiAgc2NoZWR1bGU8QSBleHRlbmRzIE1pbmltdW1Bcmd1bWVudFQsIEkgZXh0ZW5kcyBNaW5pbXVtSW5wdXRULCBPIGV4dGVuZHMgTWluaW11bU91dHB1dFQ+KFxuICAgIG5hbWU6IEpvYk5hbWUsXG4gICAgYXJndW1lbnQ6IEEsXG4gICAgb3B0aW9ucz86IFNjaGVkdWxlSm9iT3B0aW9ucyxcbiAgKTogSm9iPEEsIEksIE8+IHtcbiAgICBpZiAodGhpcy5fcGF1c2VDb3VudGVyID4gMCkge1xuICAgICAgY29uc3Qgd2FpdGFibGUgPSBuZXcgU3ViamVjdDxuZXZlcj4oKTtcbiAgICAgIHRoaXMuX3F1ZXVlLnB1c2goKCkgPT4gd2FpdGFibGUuY29tcGxldGUoKSk7XG5cbiAgICAgIHJldHVybiB0aGlzLl9zY2hlZHVsZUpvYjxBLCBJLCBPPihuYW1lLCBhcmd1bWVudCwgb3B0aW9ucyB8fCB7fSwgd2FpdGFibGUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9zY2hlZHVsZUpvYjxBLCBJLCBPPihuYW1lLCBhcmd1bWVudCwgb3B0aW9ucyB8fCB7fSwgRU1QVFkpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZpbHRlciBtZXNzYWdlcy5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgX2ZpbHRlckpvYk91dGJvdW5kTWVzc2FnZXM8TyBleHRlbmRzIE1pbmltdW1PdXRwdXRUPihcbiAgICBtZXNzYWdlOiBKb2JPdXRib3VuZE1lc3NhZ2U8Tz4sXG4gICAgc3RhdGU6IEpvYlN0YXRlLFxuICApIHtcbiAgICBzd2l0Y2ggKG1lc3NhZ2Uua2luZCkge1xuICAgICAgY2FzZSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLk9uUmVhZHk6XG4gICAgICAgIHJldHVybiBzdGF0ZSA9PSBKb2JTdGF0ZS5RdWV1ZWQ7XG4gICAgICBjYXNlIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuU3RhcnQ6XG4gICAgICAgIHJldHVybiBzdGF0ZSA9PSBKb2JTdGF0ZS5SZWFkeTtcblxuICAgICAgY2FzZSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLkVuZDpcbiAgICAgICAgcmV0dXJuIHN0YXRlID09IEpvYlN0YXRlLlN0YXJ0ZWQgfHwgc3RhdGUgPT0gSm9iU3RhdGUuUmVhZHk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJuIGEgbmV3IHN0YXRlLiBUaGlzIGlzIGp1c3QgdG8gc2ltcGxpZnkgdGhlIHJlYWRpbmcgb2YgdGhlIF9jcmVhdGVKb2IgbWV0aG9kLlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHJpdmF0ZSBfdXBkYXRlU3RhdGU8TyBleHRlbmRzIE1pbmltdW1PdXRwdXRUPihcbiAgICBtZXNzYWdlOiBKb2JPdXRib3VuZE1lc3NhZ2U8Tz4sXG4gICAgc3RhdGU6IEpvYlN0YXRlLFxuICApOiBKb2JTdGF0ZSB7XG4gICAgc3dpdGNoIChtZXNzYWdlLmtpbmQpIHtcbiAgICAgIGNhc2UgSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5PblJlYWR5OlxuICAgICAgICByZXR1cm4gSm9iU3RhdGUuUmVhZHk7XG4gICAgICBjYXNlIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuU3RhcnQ6XG4gICAgICAgIHJldHVybiBKb2JTdGF0ZS5TdGFydGVkO1xuICAgICAgY2FzZSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLkVuZDpcbiAgICAgICAgcmV0dXJuIEpvYlN0YXRlLkVuZGVkO1xuICAgIH1cblxuICAgIHJldHVybiBzdGF0ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgdGhlIGpvYi5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBtYXgtbGluZXMtcGVyLWZ1bmN0aW9uXG4gIHByaXZhdGUgX2NyZWF0ZUpvYjxBIGV4dGVuZHMgTWluaW11bUFyZ3VtZW50VCwgSSBleHRlbmRzIE1pbmltdW1JbnB1dFQsIE8gZXh0ZW5kcyBNaW5pbXVtT3V0cHV0VD4oXG4gICAgbmFtZTogSm9iTmFtZSxcbiAgICBhcmd1bWVudDogQSxcbiAgICBoYW5kbGVyOiBPYnNlcnZhYmxlPEpvYkhhbmRsZXJXaXRoRXh0cmEgfCBudWxsPixcbiAgICBpbmJvdW5kQnVzOiBPYnNlcnZlcjxKb2JJbmJvdW5kTWVzc2FnZTxJPj4sXG4gICAgb3V0Ym91bmRCdXM6IE9ic2VydmFibGU8Sm9iT3V0Ym91bmRNZXNzYWdlPE8+PixcbiAgKTogSm9iPEEsIEksIE8+IHtcbiAgICBjb25zdCBzY2hlbWFSZWdpc3RyeSA9IHRoaXMuX3NjaGVtYVJlZ2lzdHJ5O1xuXG4gICAgY29uc3QgY2hhbm5lbHNTdWJqZWN0ID0gbmV3IE1hcDxzdHJpbmcsIFN1YmplY3Q8SnNvblZhbHVlPj4oKTtcbiAgICBjb25zdCBjaGFubmVscyA9IG5ldyBNYXA8c3RyaW5nLCBPYnNlcnZhYmxlPEpzb25WYWx1ZT4+KCk7XG5cbiAgICBsZXQgc3RhdGUgPSBKb2JTdGF0ZS5RdWV1ZWQ7XG4gICAgbGV0IHBpbmdJZCA9IDA7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGlucHV0IGNoYW5uZWwgYnkgaGF2aW5nIGEgZmlsdGVyLlxuICAgIGNvbnN0IGlucHV0ID0gbmV3IFN1YmplY3Q8SnNvblZhbHVlPigpO1xuICAgIGlucHV0XG4gICAgICAucGlwZShcbiAgICAgICAgY29uY2F0TWFwKChtZXNzYWdlKSA9PlxuICAgICAgICAgIGhhbmRsZXIucGlwZShcbiAgICAgICAgICAgIHN3aXRjaE1hcChhc3luYyAoaGFuZGxlcikgPT4ge1xuICAgICAgICAgICAgICBpZiAoaGFuZGxlciA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBKb2JEb2VzTm90RXhpc3RFeGNlcHRpb24obmFtZSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBjb25zdCB2YWxpZGF0b3IgPSBhd2FpdCBoYW5kbGVyLmlucHV0VjtcblxuICAgICAgICAgICAgICByZXR1cm4gdmFsaWRhdG9yKG1lc3NhZ2UpO1xuICAgICAgICAgICAgfSksXG4gICAgICAgICAgKSxcbiAgICAgICAgKSxcbiAgICAgICAgZmlsdGVyKChyZXN1bHQpID0+IHJlc3VsdC5zdWNjZXNzKSxcbiAgICAgICAgbWFwKChyZXN1bHQpID0+IHJlc3VsdC5kYXRhIGFzIEkpLFxuICAgICAgKVxuICAgICAgLnN1YnNjcmliZSgodmFsdWUpID0+IGluYm91bmRCdXMubmV4dCh7IGtpbmQ6IEpvYkluYm91bmRNZXNzYWdlS2luZC5JbnB1dCwgdmFsdWUgfSkpO1xuXG4gICAgb3V0Ym91bmRCdXMgPSBjb25jYXQoXG4gICAgICBvdXRib3VuZEJ1cyxcbiAgICAgIC8vIEFkZCBhbiBFbmQgbWVzc2FnZSBhdCBjb21wbGV0aW9uLiBUaGlzIHdpbGwgYmUgZmlsdGVyZWQgb3V0IGlmIHRoZSBqb2IgYWN0dWFsbHkgc2VuZCBhblxuICAgICAgLy8gRW5kLlxuICAgICAgaGFuZGxlci5waXBlKFxuICAgICAgICBzd2l0Y2hNYXAoKGhhbmRsZXIpID0+IHtcbiAgICAgICAgICBpZiAoaGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIG9mPEpvYk91dGJvdW5kTWVzc2FnZTxPPj4oe1xuICAgICAgICAgICAgICBraW5kOiBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLkVuZCxcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGhhbmRsZXIuam9iRGVzY3JpcHRpb24sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIEVNUFRZIGFzIE9ic2VydmFibGU8Sm9iT3V0Ym91bmRNZXNzYWdlPE8+PjtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKSxcbiAgICApLnBpcGUoXG4gICAgICBmaWx0ZXIoKG1lc3NhZ2UpID0+IHRoaXMuX2ZpbHRlckpvYk91dGJvdW5kTWVzc2FnZXMobWVzc2FnZSwgc3RhdGUpKSxcbiAgICAgIC8vIFVwZGF0ZSBpbnRlcm5hbCBsb2dpYyBhbmQgSm9iPD4gbWVtYmVycy5cbiAgICAgIHRhcChcbiAgICAgICAgKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAvLyBVcGRhdGUgdGhlIHN0YXRlLlxuICAgICAgICAgIHN0YXRlID0gdGhpcy5fdXBkYXRlU3RhdGUobWVzc2FnZSwgc3RhdGUpO1xuXG4gICAgICAgICAgc3dpdGNoIChtZXNzYWdlLmtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5DaGFubmVsQ3JlYXRlOiB7XG4gICAgICAgICAgICAgIGNvbnN0IG1heWJlU3ViamVjdCA9IGNoYW5uZWxzU3ViamVjdC5nZXQobWVzc2FnZS5uYW1lKTtcbiAgICAgICAgICAgICAgLy8gSWYgaXQgZG9lc24ndCBleGlzdCBvciBpdCdzIGNsb3NlZCBvbiB0aGUgb3RoZXIgZW5kLlxuICAgICAgICAgICAgICBpZiAoIW1heWJlU3ViamVjdCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBuZXcgU3ViamVjdDxKc29uVmFsdWU+KCk7XG4gICAgICAgICAgICAgICAgY2hhbm5lbHNTdWJqZWN0LnNldChtZXNzYWdlLm5hbWUsIHMpO1xuICAgICAgICAgICAgICAgIGNoYW5uZWxzLnNldChtZXNzYWdlLm5hbWUsIHMuYXNPYnNlcnZhYmxlKCkpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYXNlIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuQ2hhbm5lbE1lc3NhZ2U6IHtcbiAgICAgICAgICAgICAgY29uc3QgbWF5YmVTdWJqZWN0ID0gY2hhbm5lbHNTdWJqZWN0LmdldChtZXNzYWdlLm5hbWUpO1xuICAgICAgICAgICAgICBpZiAobWF5YmVTdWJqZWN0KSB7XG4gICAgICAgICAgICAgICAgbWF5YmVTdWJqZWN0Lm5leHQobWVzc2FnZS5tZXNzYWdlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2FzZSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLkNoYW5uZWxDb21wbGV0ZToge1xuICAgICAgICAgICAgICBjb25zdCBtYXliZVN1YmplY3QgPSBjaGFubmVsc1N1YmplY3QuZ2V0KG1lc3NhZ2UubmFtZSk7XG4gICAgICAgICAgICAgIGlmIChtYXliZVN1YmplY3QpIHtcbiAgICAgICAgICAgICAgICBtYXliZVN1YmplY3QuY29tcGxldGUoKTtcbiAgICAgICAgICAgICAgICBjaGFubmVsc1N1YmplY3QuZGVsZXRlKG1lc3NhZ2UubmFtZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNhc2UgSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5DaGFubmVsRXJyb3I6IHtcbiAgICAgICAgICAgICAgY29uc3QgbWF5YmVTdWJqZWN0ID0gY2hhbm5lbHNTdWJqZWN0LmdldChtZXNzYWdlLm5hbWUpO1xuICAgICAgICAgICAgICBpZiAobWF5YmVTdWJqZWN0KSB7XG4gICAgICAgICAgICAgICAgbWF5YmVTdWJqZWN0LmVycm9yKG1lc3NhZ2UuZXJyb3IpO1xuICAgICAgICAgICAgICAgIGNoYW5uZWxzU3ViamVjdC5kZWxldGUobWVzc2FnZS5uYW1lKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICBzdGF0ZSA9IEpvYlN0YXRlLkVycm9yZWQ7XG4gICAgICAgIH0sXG4gICAgICApLFxuXG4gICAgICAvLyBEbyBvdXRwdXQgdmFsaWRhdGlvbiAobWlnaHQgaW5jbHVkZSBkZWZhdWx0IHZhbHVlcyBzbyB0aGlzIG1pZ2h0IGhhdmUgc2lkZVxuICAgICAgLy8gZWZmZWN0cykuIFdlIGtlZXAgYWxsIG1lc3NhZ2VzIGluIG9yZGVyLlxuICAgICAgY29uY2F0TWFwKChtZXNzYWdlKSA9PiB7XG4gICAgICAgIGlmIChtZXNzYWdlLmtpbmQgIT09IEpvYk91dGJvdW5kTWVzc2FnZUtpbmQuT3V0cHV0KSB7XG4gICAgICAgICAgcmV0dXJuIG9mKG1lc3NhZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGhhbmRsZXIucGlwZShcbiAgICAgICAgICBzd2l0Y2hNYXAoYXN5bmMgKGhhbmRsZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChoYW5kbGVyID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBKb2JEb2VzTm90RXhpc3RFeGNlcHRpb24obmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB2YWxpZGF0ZSA9IGF3YWl0IGhhbmRsZXIub3V0cHV0VjtcbiAgICAgICAgICAgIGNvbnN0IG91dHB1dCA9IGF3YWl0IHZhbGlkYXRlKG1lc3NhZ2UudmFsdWUpO1xuICAgICAgICAgICAgaWYgKCFvdXRwdXQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgSm9iT3V0cHV0U2NoZW1hVmFsaWRhdGlvbkVycm9yKG91dHB1dC5lcnJvcnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5tZXNzYWdlLFxuICAgICAgICAgICAgICBvdXRwdXQ6IG91dHB1dC5kYXRhIGFzIE8sXG4gICAgICAgICAgICB9IGFzIEpvYk91dGJvdW5kTWVzc2FnZU91dHB1dDxPPjtcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBPYnNlcnZhYmxlPEpvYk91dGJvdW5kTWVzc2FnZTxPPj47XG4gICAgICB9KSxcbiAgICAgIF9qb2JTaGFyZSgpLFxuICAgICk7XG5cbiAgICBjb25zdCBvdXRwdXQgPSBvdXRib3VuZEJ1cy5waXBlKFxuICAgICAgZmlsdGVyKCh4KSA9PiB4LmtpbmQgPT0gSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5PdXRwdXQpLFxuICAgICAgbWFwKCh4KSA9PiAoeCBhcyBKb2JPdXRib3VuZE1lc3NhZ2VPdXRwdXQ8Tz4pLnZhbHVlKSxcbiAgICAgIHNoYXJlUmVwbGF5KDEpLFxuICAgICk7XG5cbiAgICAvLyBSZXR1cm4gdGhlIEpvYi5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0IHN0YXRlKCkge1xuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICB9LFxuICAgICAgYXJndW1lbnQsXG4gICAgICBkZXNjcmlwdGlvbjogaGFuZGxlci5waXBlKFxuICAgICAgICBzd2l0Y2hNYXAoKGhhbmRsZXIpID0+IHtcbiAgICAgICAgICBpZiAoaGFuZGxlciA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEpvYkRvZXNOb3RFeGlzdEV4Y2VwdGlvbihuYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG9mKGhhbmRsZXIuam9iRGVzY3JpcHRpb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApLFxuICAgICAgb3V0cHV0LFxuICAgICAgZ2V0Q2hhbm5lbDxUIGV4dGVuZHMgSnNvblZhbHVlPihcbiAgICAgICAgbmFtZTogSm9iTmFtZSxcbiAgICAgICAgc2NoZW1hOiBzY2hlbWEuSnNvblNjaGVtYSA9IHRydWUsXG4gICAgICApOiBPYnNlcnZhYmxlPFQ+IHtcbiAgICAgICAgbGV0IG1heWJlT2JzZXJ2YWJsZSA9IGNoYW5uZWxzLmdldChuYW1lKTtcbiAgICAgICAgaWYgKCFtYXliZU9ic2VydmFibGUpIHtcbiAgICAgICAgICBjb25zdCBzID0gbmV3IFN1YmplY3Q8VD4oKTtcbiAgICAgICAgICBjaGFubmVsc1N1YmplY3Quc2V0KG5hbWUsIHMgYXMgdW5rbm93biBhcyBTdWJqZWN0PEpzb25WYWx1ZT4pO1xuICAgICAgICAgIGNoYW5uZWxzLnNldChuYW1lLCBzLmFzT2JzZXJ2YWJsZSgpKTtcblxuICAgICAgICAgIG1heWJlT2JzZXJ2YWJsZSA9IHMuYXNPYnNlcnZhYmxlKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbWF5YmVPYnNlcnZhYmxlLnBpcGUoXG4gICAgICAgICAgLy8gS2VlcCB0aGUgb3JkZXIgb2YgbWVzc2FnZXMuXG4gICAgICAgICAgY29uY2F0TWFwKChtZXNzYWdlKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZnJvbShzY2hlbWFSZWdpc3RyeS5jb21waWxlKHNjaGVtYSkpLnBpcGUoXG4gICAgICAgICAgICAgIHN3aXRjaE1hcCgodmFsaWRhdGUpID0+IHZhbGlkYXRlKG1lc3NhZ2UpKSxcbiAgICAgICAgICAgICAgZmlsdGVyKCh4KSA9PiB4LnN1Y2Nlc3MpLFxuICAgICAgICAgICAgICBtYXAoKHgpID0+IHguZGF0YSBhcyBUKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICAgcGluZygpIHtcbiAgICAgICAgY29uc3QgaWQgPSBwaW5nSWQrKztcbiAgICAgICAgaW5ib3VuZEJ1cy5uZXh0KHsga2luZDogSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLlBpbmcsIGlkIH0pO1xuXG4gICAgICAgIHJldHVybiBvdXRib3VuZEJ1cy5waXBlKFxuICAgICAgICAgIGZpbHRlcigoeCkgPT4geC5raW5kID09PSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLlBvbmcgJiYgeC5pZCA9PSBpZCksXG4gICAgICAgICAgZmlyc3QoKSxcbiAgICAgICAgICBpZ25vcmVFbGVtZW50cygpLFxuICAgICAgICApO1xuICAgICAgfSxcbiAgICAgIHN0b3AoKSB7XG4gICAgICAgIGluYm91bmRCdXMubmV4dCh7IGtpbmQ6IEpvYkluYm91bmRNZXNzYWdlS2luZC5TdG9wIH0pO1xuICAgICAgfSxcbiAgICAgIGlucHV0LFxuICAgICAgaW5ib3VuZEJ1cyxcbiAgICAgIG91dGJvdW5kQnVzLFxuICAgIH07XG4gIH1cblxuICBwcm90ZWN0ZWQgX3NjaGVkdWxlSm9iPFxuICAgIEEgZXh0ZW5kcyBNaW5pbXVtQXJndW1lbnRULFxuICAgIEkgZXh0ZW5kcyBNaW5pbXVtSW5wdXRULFxuICAgIE8gZXh0ZW5kcyBNaW5pbXVtT3V0cHV0VCxcbiAgPihcbiAgICBuYW1lOiBKb2JOYW1lLFxuICAgIGFyZ3VtZW50OiBBLFxuICAgIG9wdGlvbnM6IFNjaGVkdWxlSm9iT3B0aW9ucyxcbiAgICB3YWl0YWJsZTogT2JzZXJ2YWJsZTxuZXZlcj4sXG4gICk6IEpvYjxBLCBJLCBPPiB7XG4gICAgLy8gR2V0IGhhbmRsZXIgZmlyc3QsIHNpbmNlIHRoaXMgY2FuIGVycm9yIG91dCBpZiB0aGVyZSdzIG5vIGhhbmRsZXIgZm9yIHRoZSBqb2IgbmFtZS5cbiAgICBjb25zdCBoYW5kbGVyID0gdGhpcy5fZ2V0SW50ZXJuYWxEZXNjcmlwdGlvbihuYW1lKTtcblxuICAgIGNvbnN0IG9wdGlvbnNEZXBzID0gKG9wdGlvbnMgJiYgb3B0aW9ucy5kZXBlbmRlbmNpZXMpIHx8IFtdO1xuICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IEFycmF5LmlzQXJyYXkob3B0aW9uc0RlcHMpID8gb3B0aW9uc0RlcHMgOiBbb3B0aW9uc0RlcHNdO1xuXG4gICAgY29uc3QgaW5ib3VuZEJ1cyA9IG5ldyBTdWJqZWN0PEpvYkluYm91bmRNZXNzYWdlPEk+PigpO1xuICAgIGNvbnN0IG91dGJvdW5kQnVzID0gY29uY2F0KFxuICAgICAgLy8gV2FpdCBmb3IgZGVwZW5kZW5jaWVzLCBtYWtlIHN1cmUgdG8gbm90IHJlcG9ydCBtZXNzYWdlcyBmcm9tIGRlcGVuZGVuY2llcy4gU3Vic2NyaWJlIHRvXG4gICAgICAvLyBhbGwgZGVwZW5kZW5jaWVzIGF0IHRoZSBzYW1lIHRpbWUgc28gdGhleSBydW4gY29uY3VycmVudGx5LlxuICAgICAgbWVyZ2UoLi4uZGVwZW5kZW5jaWVzLm1hcCgoeCkgPT4geC5vdXRib3VuZEJ1cykpLnBpcGUoaWdub3JlRWxlbWVudHMoKSksXG5cbiAgICAgIC8vIFdhaXQgZm9yIHBhdXNlKCkgdG8gY2xlYXIgKGlmIG5lY2Vzc2FyeSkuXG4gICAgICB3YWl0YWJsZSxcblxuICAgICAgZnJvbShoYW5kbGVyKS5waXBlKFxuICAgICAgICBzd2l0Y2hNYXAoXG4gICAgICAgICAgKGhhbmRsZXIpID0+XG4gICAgICAgICAgICBuZXcgT2JzZXJ2YWJsZTxKb2JPdXRib3VuZE1lc3NhZ2U8Tz4+KChzdWJzY3JpYmVyOiBPYnNlcnZlcjxKb2JPdXRib3VuZE1lc3NhZ2U8Tz4+KSA9PiB7XG4gICAgICAgICAgICAgIGlmICghaGFuZGxlcikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBKb2JEb2VzTm90RXhpc3RFeGNlcHRpb24obmFtZSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgYXJndW1lbnQuXG4gICAgICAgICAgICAgIHJldHVybiBmcm9tKGhhbmRsZXIuYXJndW1lbnRWKVxuICAgICAgICAgICAgICAgIC5waXBlKFxuICAgICAgICAgICAgICAgICAgc3dpdGNoTWFwKCh2YWxpZGF0ZSkgPT4gdmFsaWRhdGUoYXJndW1lbnQpKSxcbiAgICAgICAgICAgICAgICAgIHN3aXRjaE1hcCgob3V0cHV0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghb3V0cHV0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgSm9iQXJndW1lbnRTY2hlbWFWYWxpZGF0aW9uRXJyb3Iob3V0cHV0LmVycm9ycyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmd1bWVudDogQSA9IG91dHB1dC5kYXRhIGFzIEE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gaGFuZGxlci5qb2JEZXNjcmlwdGlvbjtcbiAgICAgICAgICAgICAgICAgICAgc3Vic2NyaWJlci5uZXh0KHsga2luZDogSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5PblJlYWR5LCBkZXNjcmlwdGlvbiB9KTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0ID0ge1xuICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgIGRlcGVuZGVuY2llczogWy4uLmRlcGVuZGVuY2llc10sXG4gICAgICAgICAgICAgICAgICAgICAgaW5ib3VuZEJ1czogaW5ib3VuZEJ1cy5hc09ic2VydmFibGUoKSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlZHVsZXI6IHRoaXMgYXMgU2NoZWR1bGVyPE1pbmltdW1Bcmd1bWVudFQsIE1pbmltdW1JbnB1dFQsIE1pbmltdW1PdXRwdXRUPixcbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGFuZGxlcihhcmd1bWVudCwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgLnN1YnNjcmliZShzdWJzY3JpYmVyIGFzIE9ic2VydmVyPEpvYk91dGJvdW5kTWVzc2FnZTxKc29uVmFsdWU+Pik7XG4gICAgICAgICAgICB9KSxcbiAgICAgICAgKSxcbiAgICAgICksXG4gICAgKTtcblxuICAgIHJldHVybiB0aGlzLl9jcmVhdGVKb2IobmFtZSwgYXJndW1lbnQsIGhhbmRsZXIsIGluYm91bmRCdXMsIG91dGJvdW5kQnVzKTtcbiAgfVxufVxuIl19