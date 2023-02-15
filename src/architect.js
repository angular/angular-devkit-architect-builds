"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Architect = void 0;
const core_1 = require("@angular-devkit/core");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const api_1 = require("./api");
const jobs_1 = require("./jobs");
const schedule_by_name_1 = require("./schedule-by-name");
const inputSchema = require('./input-schema.json');
const outputSchema = require('./output-schema.json');
function _createJobHandlerFromBuilderInfo(info, target, host, registry, baseOptions) {
    const jobDescription = {
        name: target ? `{${(0, api_1.targetStringFromTarget)(target)}}` : info.builderName,
        argument: { type: 'object' },
        input: inputSchema,
        output: outputSchema,
        info,
    };
    function handler(argument, context) {
        // Add input validation to the inbound bus.
        const inboundBusWithInputValidation = context.inboundBus.pipe((0, operators_1.concatMap)(async (message) => {
            if (message.kind === jobs_1.JobInboundMessageKind.Input) {
                const v = message.value;
                const options = {
                    ...baseOptions,
                    ...v.options,
                };
                // Validate v against the options schema.
                const validation = await registry.compile(info.optionSchema);
                const validationResult = await validation(options);
                const { data, success, errors } = validationResult;
                if (!success) {
                    throw new core_1.json.schema.SchemaValidationException(errors);
                }
                return { ...message, value: { ...v, options: data } };
            }
            else {
                return message;
            }
        }), 
        // Using a share replay because the job might be synchronously sending input, but
        // asynchronously listening to it.
        (0, operators_1.shareReplay)(1));
        // Make an inboundBus that completes instead of erroring out.
        // We'll merge the errors into the output instead.
        const inboundBus = (0, rxjs_1.onErrorResumeNext)(inboundBusWithInputValidation);
        const output = (0, rxjs_1.from)(host.loadBuilder(info)).pipe((0, operators_1.concatMap)((builder) => {
            if (builder === null) {
                throw new Error(`Cannot load builder for builderInfo ${JSON.stringify(info, null, 2)}`);
            }
            return builder.handler(argument, { ...context, inboundBus }).pipe((0, operators_1.map)((output) => {
                if (output.kind === jobs_1.JobOutboundMessageKind.Output) {
                    // Add target to it.
                    return {
                        ...output,
                        value: {
                            ...output.value,
                            ...(target ? { target } : 0),
                        },
                    };
                }
                else {
                    return output;
                }
            }));
        }), 
        // Share subscriptions to the output, otherwise the the handler will be re-run.
        (0, operators_1.shareReplay)());
        // Separate the errors from the inbound bus into their own observable that completes when the
        // builder output does.
        const inboundBusErrors = inboundBusWithInputValidation.pipe((0, operators_1.ignoreElements)(), (0, operators_1.takeUntil)((0, rxjs_1.onErrorResumeNext)(output.pipe((0, operators_1.last)()))));
        // Return the builder output plus any input errors.
        return (0, rxjs_1.merge)(inboundBusErrors, output);
    }
    return (0, rxjs_1.of)(Object.assign(handler, { jobDescription }));
}
/**
 * A JobRegistry that resolves builder targets from the host.
 */
class ArchitectBuilderJobRegistry {
    constructor(_host, _registry, _jobCache, _infoCache) {
        this._host = _host;
        this._registry = _registry;
        this._jobCache = _jobCache;
        this._infoCache = _infoCache;
    }
    _resolveBuilder(name) {
        const cache = this._infoCache;
        if (cache) {
            const maybeCache = cache.get(name);
            if (maybeCache !== undefined) {
                return maybeCache;
            }
            const info = (0, rxjs_1.from)(this._host.resolveBuilder(name)).pipe((0, operators_1.shareReplay)(1));
            cache.set(name, info);
            return info;
        }
        return (0, rxjs_1.from)(this._host.resolveBuilder(name));
    }
    _createBuilder(info, target, options) {
        const cache = this._jobCache;
        if (target) {
            const maybeHit = cache && cache.get((0, api_1.targetStringFromTarget)(target));
            if (maybeHit) {
                return maybeHit;
            }
        }
        else {
            const maybeHit = cache && cache.get(info.builderName);
            if (maybeHit) {
                return maybeHit;
            }
        }
        const result = _createJobHandlerFromBuilderInfo(info, target, this._host, this._registry, options || {});
        if (cache) {
            if (target) {
                cache.set((0, api_1.targetStringFromTarget)(target), result.pipe((0, operators_1.shareReplay)(1)));
            }
            else {
                cache.set(info.builderName, result.pipe((0, operators_1.shareReplay)(1)));
            }
        }
        return result;
    }
    get(name) {
        const m = name.match(/^([^:]+):([^:]+)$/i);
        if (!m) {
            return (0, rxjs_1.of)(null);
        }
        return (0, rxjs_1.from)(this._resolveBuilder(name)).pipe((0, operators_1.concatMap)((builderInfo) => (builderInfo ? this._createBuilder(builderInfo) : (0, rxjs_1.of)(null))), (0, operators_1.first)(null, null));
    }
}
/**
 * A JobRegistry that resolves targets from the host.
 */
class ArchitectTargetJobRegistry extends ArchitectBuilderJobRegistry {
    get(name) {
        const m = name.match(/^{([^:]+):([^:]+)(?::([^:]*))?}$/i);
        if (!m) {
            return (0, rxjs_1.of)(null);
        }
        const target = {
            project: m[1],
            target: m[2],
            configuration: m[3],
        };
        return (0, rxjs_1.from)(Promise.all([
            this._host.getBuilderNameForTarget(target),
            this._host.getOptionsForTarget(target),
        ])).pipe((0, operators_1.concatMap)(([builderStr, options]) => {
            if (builderStr === null || options === null) {
                return (0, rxjs_1.of)(null);
            }
            return this._resolveBuilder(builderStr).pipe((0, operators_1.concatMap)((builderInfo) => {
                if (builderInfo === null) {
                    return (0, rxjs_1.of)(null);
                }
                return this._createBuilder(builderInfo, target, options);
            }));
        }), (0, operators_1.first)(null, null));
    }
}
function _getTargetOptionsFactory(host) {
    return (0, jobs_1.createJobHandler)((target) => {
        return host.getOptionsForTarget(target).then((options) => {
            if (options === null) {
                throw new Error(`Invalid target: ${JSON.stringify(target)}.`);
            }
            return options;
        });
    }, {
        name: '..getTargetOptions',
        output: { type: 'object' },
        argument: inputSchema.properties.target,
    });
}
function _getProjectMetadataFactory(host) {
    return (0, jobs_1.createJobHandler)((target) => {
        return host.getProjectMetadata(target).then((options) => {
            if (options === null) {
                throw new Error(`Invalid target: ${JSON.stringify(target)}.`);
            }
            return options;
        });
    }, {
        name: '..getProjectMetadata',
        output: { type: 'object' },
        argument: {
            oneOf: [{ type: 'string' }, inputSchema.properties.target],
        },
    });
}
function _getBuilderNameForTargetFactory(host) {
    return (0, jobs_1.createJobHandler)(async (target) => {
        const builderName = await host.getBuilderNameForTarget(target);
        if (!builderName) {
            throw new Error(`No builder were found for target ${(0, api_1.targetStringFromTarget)(target)}.`);
        }
        return builderName;
    }, {
        name: '..getBuilderNameForTarget',
        output: { type: 'string' },
        argument: inputSchema.properties.target,
    });
}
function _validateOptionsFactory(host, registry) {
    return (0, jobs_1.createJobHandler)(async ([builderName, options]) => {
        // Get option schema from the host.
        const builderInfo = await host.resolveBuilder(builderName);
        if (!builderInfo) {
            throw new Error(`No builder info were found for builder ${JSON.stringify(builderName)}.`);
        }
        const validation = await registry.compile(builderInfo.optionSchema);
        const { data, success, errors } = await validation(options);
        if (!success) {
            throw new core_1.json.schema.SchemaValidationException(errors);
        }
        return data;
    }, {
        name: '..validateOptions',
        output: { type: 'object' },
        argument: {
            type: 'array',
            items: [{ type: 'string' }, { type: 'object' }],
        },
    });
}
class Architect {
    constructor(_host, registry = new core_1.json.schema.CoreSchemaRegistry(), additionalJobRegistry) {
        this._host = _host;
        this._jobCache = new Map();
        this._infoCache = new Map();
        const privateArchitectJobRegistry = new jobs_1.SimpleJobRegistry();
        // Create private jobs.
        privateArchitectJobRegistry.register(_getTargetOptionsFactory(_host));
        privateArchitectJobRegistry.register(_getBuilderNameForTargetFactory(_host));
        privateArchitectJobRegistry.register(_validateOptionsFactory(_host, registry));
        privateArchitectJobRegistry.register(_getProjectMetadataFactory(_host));
        const jobRegistry = new jobs_1.FallbackRegistry([
            new ArchitectTargetJobRegistry(_host, registry, this._jobCache, this._infoCache),
            new ArchitectBuilderJobRegistry(_host, registry, this._jobCache, this._infoCache),
            privateArchitectJobRegistry,
            ...(additionalJobRegistry ? [additionalJobRegistry] : []),
        ]);
        this._scheduler = new jobs_1.SimpleScheduler(jobRegistry, registry);
    }
    has(name) {
        return this._scheduler.has(name);
    }
    scheduleBuilder(name, options, scheduleOptions = {}) {
        // The below will match 'project:target:configuration'
        if (!/^[^:]+:[^:]+(:[^:]+)?$/.test(name)) {
            throw new Error('Invalid builder name: ' + JSON.stringify(name));
        }
        return (0, schedule_by_name_1.scheduleByName)(name, options, {
            scheduler: this._scheduler,
            logger: scheduleOptions.logger || new core_1.logging.NullLogger(),
            currentDirectory: this._host.getCurrentDirectory(),
            workspaceRoot: this._host.getWorkspaceRoot(),
        });
    }
    scheduleTarget(target, overrides = {}, scheduleOptions = {}) {
        return (0, schedule_by_name_1.scheduleByTarget)(target, overrides, {
            scheduler: this._scheduler,
            logger: scheduleOptions.logger || new core_1.logging.NullLogger(),
            currentDirectory: this._host.getCurrentDirectory(),
            workspaceRoot: this._host.getWorkspaceRoot(),
        });
    }
}
exports.Architect = Architect;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjaGl0ZWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L3NyYy9hcmNoaXRlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBRUgsK0NBQXFEO0FBQ3JELCtCQUFzRTtBQUN0RSw4Q0FRd0I7QUFDeEIsK0JBUWU7QUFFZixpQ0FhZ0I7QUFDaEIseURBQXNFO0FBRXRFLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQ25ELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0FBRXJELFNBQVMsZ0NBQWdDLENBQ3ZDLElBQWlCLEVBQ2pCLE1BQTBCLEVBQzFCLElBQW1CLEVBQ25CLFFBQW9DLEVBQ3BDLFdBQTRCO0lBRTVCLE1BQU0sY0FBYyxHQUF1QjtRQUN6QyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUEsNEJBQXNCLEVBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7UUFDdkUsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtRQUM1QixLQUFLLEVBQUUsV0FBVztRQUNsQixNQUFNLEVBQUUsWUFBWTtRQUNwQixJQUFJO0tBQ0wsQ0FBQztJQUVGLFNBQVMsT0FBTyxDQUFDLFFBQXlCLEVBQUUsT0FBMEI7UUFDcEUsMkNBQTJDO1FBQzNDLE1BQU0sNkJBQTZCLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQzNELElBQUEscUJBQVMsRUFBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDMUIsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLDRCQUFxQixDQUFDLEtBQUssRUFBRTtnQkFDaEQsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLEtBQXFCLENBQUM7Z0JB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QUUsT0FBTyxFQUFFO1lBQ25DLFNBQVMsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMxQixNQUFNLEVBQUUsZUFBZSxDQUFDLE1BQU0sSUFBSSxJQUFJLGNBQU8sQ0FBQyxVQUFVLEVBQUU7WUFDMUQsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRTtZQUNsRCxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtTQUM3QyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsY0FBYyxDQUNaLE1BQWMsRUFDZCxZQUE2QixFQUFFLEVBQy9CLGtCQUFtQyxFQUFFO1FBRXJDLE9BQU8sSUFBQSxtQ0FBZ0IsRUFBQyxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQ3pDLFNBQVMsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMxQixNQUFNLEVBQUUsZUFBZSxDQUFDLE1BQU0sSUFBSSxJQUFJLGNBQU8sQ0FBQyxVQUFVLEVBQUU7WUFDMUQsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRTtZQUNsRCxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtTQUM3QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1REQsOEJBNERDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGpzb24sIGxvZ2dpbmcgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlLCBmcm9tLCBtZXJnZSwgb2YsIG9uRXJyb3JSZXN1bWVOZXh0IH0gZnJvbSAncnhqcyc7XG5pbXBvcnQge1xuICBjb25jYXRNYXAsXG4gIGZpcnN0LFxuICBpZ25vcmVFbGVtZW50cyxcbiAgbGFzdCxcbiAgbWFwLFxuICBzaGFyZVJlcGxheSxcbiAgdGFrZVVudGlsLFxufSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQge1xuICBCdWlsZGVySW5mbyxcbiAgQnVpbGRlcklucHV0LFxuICBCdWlsZGVyT3V0cHV0LFxuICBCdWlsZGVyUmVnaXN0cnksXG4gIEJ1aWxkZXJSdW4sXG4gIFRhcmdldCxcbiAgdGFyZ2V0U3RyaW5nRnJvbVRhcmdldCxcbn0gZnJvbSAnLi9hcGknO1xuaW1wb3J0IHsgQXJjaGl0ZWN0SG9zdCwgQnVpbGRlckRlc2NyaXB0aW9uLCBCdWlsZGVySm9iSGFuZGxlciB9IGZyb20gJy4vaW50ZXJuYWwnO1xuaW1wb3J0IHtcbiAgRmFsbGJhY2tSZWdpc3RyeSxcbiAgSm9iSGFuZGxlcixcbiAgSm9iSGFuZGxlckNvbnRleHQsXG4gIEpvYkluYm91bmRNZXNzYWdlLFxuICBKb2JJbmJvdW5kTWVzc2FnZUtpbmQsXG4gIEpvYk5hbWUsXG4gIEpvYk91dGJvdW5kTWVzc2FnZUtpbmQsXG4gIFJlZ2lzdHJ5LFxuICBTY2hlZHVsZXIsXG4gIFNpbXBsZUpvYlJlZ2lzdHJ5LFxuICBTaW1wbGVTY2hlZHVsZXIsXG4gIGNyZWF0ZUpvYkhhbmRsZXIsXG59IGZyb20gJy4vam9icyc7XG5pbXBvcnQgeyBzY2hlZHVsZUJ5TmFtZSwgc2NoZWR1bGVCeVRhcmdldCB9IGZyb20gJy4vc2NoZWR1bGUtYnktbmFtZSc7XG5cbmNvbnN0IGlucHV0U2NoZW1hID0gcmVxdWlyZSgnLi9pbnB1dC1zY2hlbWEuanNvbicpO1xuY29uc3Qgb3V0cHV0U2NoZW1hID0gcmVxdWlyZSgnLi9vdXRwdXQtc2NoZW1hLmpzb24nKTtcblxuZnVuY3Rpb24gX2NyZWF0ZUpvYkhhbmRsZXJGcm9tQnVpbGRlckluZm8oXG4gIGluZm86IEJ1aWxkZXJJbmZvLFxuICB0YXJnZXQ6IFRhcmdldCB8IHVuZGVmaW5lZCxcbiAgaG9zdDogQXJjaGl0ZWN0SG9zdCxcbiAgcmVnaXN0cnk6IGpzb24uc2NoZW1hLlNjaGVtYVJlZ2lzdHJ5LFxuICBiYXNlT3B0aW9uczoganNvbi5Kc29uT2JqZWN0LFxuKTogT2JzZXJ2YWJsZTxCdWlsZGVySm9iSGFuZGxlcj4ge1xuICBjb25zdCBqb2JEZXNjcmlwdGlvbjogQnVpbGRlckRlc2NyaXB0aW9uID0ge1xuICAgIG5hbWU6IHRhcmdldCA/IGB7JHt0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCl9fWAgOiBpbmZvLmJ1aWxkZXJOYW1lLFxuICAgIGFyZ3VtZW50OiB7IHR5cGU6ICdvYmplY3QnIH0sXG4gICAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICAgIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICAgIGluZm8sXG4gIH07XG5cbiAgZnVuY3Rpb24gaGFuZGxlcihhcmd1bWVudDoganNvbi5Kc29uT2JqZWN0LCBjb250ZXh0OiBKb2JIYW5kbGVyQ29udGV4dCkge1xuICAgIC8vIEFkZCBpbnB1dCB2YWxpZGF0aW9uIHRvIHRoZSBpbmJvdW5kIGJ1cy5cbiAgICBjb25zdCBpbmJvdW5kQnVzV2l0aElucHV0VmFsaWRhdGlvbiA9IGNvbnRleHQuaW5ib3VuZEJ1cy5waXBlKFxuICAgICAgY29uY2F0TWFwKGFzeW5jIChtZXNzYWdlKSA9PiB7XG4gICAgICAgIGlmIChtZXNzYWdlLmtpbmQgPT09IEpvYkluYm91bmRNZXNzYWdlS2luZC5JbnB1dCkge1xuICAgICAgICAgIGNvbnN0IHYgPSBtZXNzYWdlLnZhbHVlIGFzIEJ1aWxkZXJJbnB1dDtcbiAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgLi4uYmFzZU9wdGlvbnMsXG4gICAgICAgICAgICAuLi52Lm9wdGlvbnMsXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIHYgYWdhaW5zdCB0aGUgb3B0aW9ucyBzY2hlbWEuXG4gICAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IGF3YWl0IHJlZ2lzdHJ5LmNvbXBpbGUoaW5mby5vcHRpb25TY2hlbWEpO1xuICAgICAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0aW9uKG9wdGlvbnMpO1xuICAgICAgICAgIGNvbnN0IHsgZGF0YSwgc3VjY2VzcywgZXJyb3JzIH0gPSB2YWxpZGF0aW9uUmVzdWx0O1xuXG4gICAgICAgICAgaWYgKCFzdWNjZXNzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcganNvbi5zY2hlbWEuU2NoZW1hVmFsaWRhdGlvbkV4Y2VwdGlvbihlcnJvcnMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB7IC4uLm1lc3NhZ2UsIHZhbHVlOiB7IC4uLnYsIG9wdGlvbnM6IGRhdGEgfSB9IGFzIEpvYkluYm91bmRNZXNzYWdlPEJ1aWxkZXJJbnB1dD47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG1lc3NhZ2UgYXMgSm9iSW5ib3VuZE1lc3NhZ2U8QnVpbGRlcklucHV0PjtcbiAgICAgICAgfVxuICAgICAgfSksXG4gICAgICAvLyBVc2luZyBhIHNoYXJlIHJlcGxheSBiZWNhdXNlIHRoZSBqb2IgbWlnaHQgYmUgc3luY2hyb25vdXNseSBzZW5kaW5nIGlucHV0LCBidXRcbiAgICAgIC8vIGFzeW5jaHJvbm91c2x5IGxpc3RlbmluZyB0byBpdC5cbiAgICAgIHNoYXJlUmVwbGF5KDEpLFxuICAgICk7XG5cbiAgICAvLyBNYWtlIGFuIGluYm91bmRCdXMgdGhhdCBjb21wbGV0ZXMgaW5zdGVhZCBvZiBlcnJvcmluZyBvdXQuXG4gICAgLy8gV2UnbGwgbWVyZ2UgdGhlIGVycm9ycyBpbnRvIHRoZSBvdXRwdXQgaW5zdGVhZC5cbiAgICBjb25zdCBpbmJvdW5kQnVzID0gb25FcnJvclJlc3VtZU5leHQoaW5ib3VuZEJ1c1dpdGhJbnB1dFZhbGlkYXRpb24pO1xuXG4gICAgY29uc3Qgb3V0cHV0ID0gZnJvbShob3N0LmxvYWRCdWlsZGVyKGluZm8pKS5waXBlKFxuICAgICAgY29uY2F0TWFwKChidWlsZGVyKSA9PiB7XG4gICAgICAgIGlmIChidWlsZGVyID09PSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgbG9hZCBidWlsZGVyIGZvciBidWlsZGVySW5mbyAke0pTT04uc3RyaW5naWZ5KGluZm8sIG51bGwsIDIpfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJ1aWxkZXIuaGFuZGxlcihhcmd1bWVudCwgeyAuLi5jb250ZXh0LCBpbmJvdW5kQnVzIH0pLnBpcGUoXG4gICAgICAgICAgbWFwKChvdXRwdXQpID0+IHtcbiAgICAgICAgICAgIGlmIChvdXRwdXQua2luZCA9PT0gSm9iT3V0Ym91bmRNZXNzYWdlS2luZC5PdXRwdXQpIHtcbiAgICAgICAgICAgICAgLy8gQWRkIHRhcmdldCB0byBpdC5cbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAuLi5vdXRwdXQsXG4gICAgICAgICAgICAgICAgdmFsdWU6IHtcbiAgICAgICAgICAgICAgICAgIC4uLm91dHB1dC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgIC4uLih0YXJnZXQgPyB7IHRhcmdldCB9IDogMCksXG4gICAgICAgICAgICAgICAgfSBhcyB1bmtub3duIGFzIGpzb24uSnNvbk9iamVjdCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG4gICAgICB9KSxcbiAgICAgIC8vIFNoYXJlIHN1YnNjcmlwdGlvbnMgdG8gdGhlIG91dHB1dCwgb3RoZXJ3aXNlIHRoZSB0aGUgaGFuZGxlciB3aWxsIGJlIHJlLXJ1bi5cbiAgICAgIHNoYXJlUmVwbGF5KCksXG4gICAgKTtcblxuICAgIC8vIFNlcGFyYXRlIHRoZSBlcnJvcnMgZnJvbSB0aGUgaW5ib3VuZCBidXMgaW50byB0aGVpciBvd24gb2JzZXJ2YWJsZSB0aGF0IGNvbXBsZXRlcyB3aGVuIHRoZVxuICAgIC8vIGJ1aWxkZXIgb3V0cHV0IGRvZXMuXG4gICAgY29uc3QgaW5ib3VuZEJ1c0Vycm9ycyA9IGluYm91bmRCdXNXaXRoSW5wdXRWYWxpZGF0aW9uLnBpcGUoXG4gICAgICBpZ25vcmVFbGVtZW50cygpLFxuICAgICAgdGFrZVVudGlsKG9uRXJyb3JSZXN1bWVOZXh0KG91dHB1dC5waXBlKGxhc3QoKSkpKSxcbiAgICApO1xuXG4gICAgLy8gUmV0dXJuIHRoZSBidWlsZGVyIG91dHB1dCBwbHVzIGFueSBpbnB1dCBlcnJvcnMuXG4gICAgcmV0dXJuIG1lcmdlKGluYm91bmRCdXNFcnJvcnMsIG91dHB1dCk7XG4gIH1cblxuICByZXR1cm4gb2YoT2JqZWN0LmFzc2lnbihoYW5kbGVyLCB7IGpvYkRlc2NyaXB0aW9uIH0pIGFzIEJ1aWxkZXJKb2JIYW5kbGVyKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTY2hlZHVsZU9wdGlvbnMge1xuICBsb2dnZXI/OiBsb2dnaW5nLkxvZ2dlcjtcbn1cblxuLyoqXG4gKiBBIEpvYlJlZ2lzdHJ5IHRoYXQgcmVzb2x2ZXMgYnVpbGRlciB0YXJnZXRzIGZyb20gdGhlIGhvc3QuXG4gKi9cbmNsYXNzIEFyY2hpdGVjdEJ1aWxkZXJKb2JSZWdpc3RyeSBpbXBsZW1lbnRzIEJ1aWxkZXJSZWdpc3RyeSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByb3RlY3RlZCBfaG9zdDogQXJjaGl0ZWN0SG9zdCxcbiAgICBwcm90ZWN0ZWQgX3JlZ2lzdHJ5OiBqc29uLnNjaGVtYS5TY2hlbWFSZWdpc3RyeSxcbiAgICBwcm90ZWN0ZWQgX2pvYkNhY2hlPzogTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxCdWlsZGVySm9iSGFuZGxlciB8IG51bGw+PixcbiAgICBwcm90ZWN0ZWQgX2luZm9DYWNoZT86IE1hcDxzdHJpbmcsIE9ic2VydmFibGU8QnVpbGRlckluZm8gfCBudWxsPj4sXG4gICkge31cblxuICBwcm90ZWN0ZWQgX3Jlc29sdmVCdWlsZGVyKG5hbWU6IHN0cmluZyk6IE9ic2VydmFibGU8QnVpbGRlckluZm8gfCBudWxsPiB7XG4gICAgY29uc3QgY2FjaGUgPSB0aGlzLl9pbmZvQ2FjaGU7XG4gICAgaWYgKGNhY2hlKSB7XG4gICAgICBjb25zdCBtYXliZUNhY2hlID0gY2FjaGUuZ2V0KG5hbWUpO1xuICAgICAgaWYgKG1heWJlQ2FjaGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbWF5YmVDYWNoZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW5mbyA9IGZyb20odGhpcy5faG9zdC5yZXNvbHZlQnVpbGRlcihuYW1lKSkucGlwZShzaGFyZVJlcGxheSgxKSk7XG4gICAgICBjYWNoZS5zZXQobmFtZSwgaW5mbyk7XG5cbiAgICAgIHJldHVybiBpbmZvO1xuICAgIH1cblxuICAgIHJldHVybiBmcm9tKHRoaXMuX2hvc3QucmVzb2x2ZUJ1aWxkZXIobmFtZSkpO1xuICB9XG5cbiAgcHJvdGVjdGVkIF9jcmVhdGVCdWlsZGVyKFxuICAgIGluZm86IEJ1aWxkZXJJbmZvLFxuICAgIHRhcmdldD86IFRhcmdldCxcbiAgICBvcHRpb25zPzoganNvbi5Kc29uT2JqZWN0LFxuICApOiBPYnNlcnZhYmxlPEJ1aWxkZXJKb2JIYW5kbGVyIHwgbnVsbD4ge1xuICAgIGNvbnN0IGNhY2hlID0gdGhpcy5fam9iQ2FjaGU7XG4gICAgaWYgKHRhcmdldCkge1xuICAgICAgY29uc3QgbWF5YmVIaXQgPSBjYWNoZSAmJiBjYWNoZS5nZXQodGFyZ2V0U3RyaW5nRnJvbVRhcmdldCh0YXJnZXQpKTtcbiAgICAgIGlmIChtYXliZUhpdCkge1xuICAgICAgICByZXR1cm4gbWF5YmVIaXQ7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG1heWJlSGl0ID0gY2FjaGUgJiYgY2FjaGUuZ2V0KGluZm8uYnVpbGRlck5hbWUpO1xuICAgICAgaWYgKG1heWJlSGl0KSB7XG4gICAgICAgIHJldHVybiBtYXliZUhpdDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBfY3JlYXRlSm9iSGFuZGxlckZyb21CdWlsZGVySW5mbyhcbiAgICAgIGluZm8sXG4gICAgICB0YXJnZXQsXG4gICAgICB0aGlzLl9ob3N0LFxuICAgICAgdGhpcy5fcmVnaXN0cnksXG4gICAgICBvcHRpb25zIHx8IHt9LFxuICAgICk7XG5cbiAgICBpZiAoY2FjaGUpIHtcbiAgICAgIGlmICh0YXJnZXQpIHtcbiAgICAgICAgY2FjaGUuc2V0KHRhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KSwgcmVzdWx0LnBpcGUoc2hhcmVSZXBsYXkoMSkpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhY2hlLnNldChpbmZvLmJ1aWxkZXJOYW1lLCByZXN1bHQucGlwZShzaGFyZVJlcGxheSgxKSkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBnZXQ8QSBleHRlbmRzIGpzb24uSnNvbk9iamVjdCwgSSBleHRlbmRzIEJ1aWxkZXJJbnB1dCwgTyBleHRlbmRzIEJ1aWxkZXJPdXRwdXQ+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgKTogT2JzZXJ2YWJsZTxKb2JIYW5kbGVyPEEsIEksIE8+IHwgbnVsbD4ge1xuICAgIGNvbnN0IG0gPSBuYW1lLm1hdGNoKC9eKFteOl0rKTooW146XSspJC9pKTtcbiAgICBpZiAoIW0pIHtcbiAgICAgIHJldHVybiBvZihudWxsKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnJvbSh0aGlzLl9yZXNvbHZlQnVpbGRlcihuYW1lKSkucGlwZShcbiAgICAgIGNvbmNhdE1hcCgoYnVpbGRlckluZm8pID0+IChidWlsZGVySW5mbyA/IHRoaXMuX2NyZWF0ZUJ1aWxkZXIoYnVpbGRlckluZm8pIDogb2YobnVsbCkpKSxcbiAgICAgIGZpcnN0KG51bGwsIG51bGwpLFxuICAgICkgYXMgT2JzZXJ2YWJsZTxKb2JIYW5kbGVyPEEsIEksIE8+IHwgbnVsbD47XG4gIH1cbn1cblxuLyoqXG4gKiBBIEpvYlJlZ2lzdHJ5IHRoYXQgcmVzb2x2ZXMgdGFyZ2V0cyBmcm9tIHRoZSBob3N0LlxuICovXG5jbGFzcyBBcmNoaXRlY3RUYXJnZXRKb2JSZWdpc3RyeSBleHRlbmRzIEFyY2hpdGVjdEJ1aWxkZXJKb2JSZWdpc3RyeSB7XG4gIG92ZXJyaWRlIGdldDxBIGV4dGVuZHMganNvbi5Kc29uT2JqZWN0LCBJIGV4dGVuZHMgQnVpbGRlcklucHV0LCBPIGV4dGVuZHMgQnVpbGRlck91dHB1dD4oXG4gICAgbmFtZTogc3RyaW5nLFxuICApOiBPYnNlcnZhYmxlPEpvYkhhbmRsZXI8QSwgSSwgTz4gfCBudWxsPiB7XG4gICAgY29uc3QgbSA9IG5hbWUubWF0Y2goL157KFteOl0rKTooW146XSspKD86OihbXjpdKikpP30kL2kpO1xuICAgIGlmICghbSkge1xuICAgICAgcmV0dXJuIG9mKG51bGwpO1xuICAgIH1cblxuICAgIGNvbnN0IHRhcmdldCA9IHtcbiAgICAgIHByb2plY3Q6IG1bMV0sXG4gICAgICB0YXJnZXQ6IG1bMl0sXG4gICAgICBjb25maWd1cmF0aW9uOiBtWzNdLFxuICAgIH07XG5cbiAgICByZXR1cm4gZnJvbShcbiAgICAgIFByb21pc2UuYWxsKFtcbiAgICAgICAgdGhpcy5faG9zdC5nZXRCdWlsZGVyTmFtZUZvclRhcmdldCh0YXJnZXQpLFxuICAgICAgICB0aGlzLl9ob3N0LmdldE9wdGlvbnNGb3JUYXJnZXQodGFyZ2V0KSxcbiAgICAgIF0pLFxuICAgICkucGlwZShcbiAgICAgIGNvbmNhdE1hcCgoW2J1aWxkZXJTdHIsIG9wdGlvbnNdKSA9PiB7XG4gICAgICAgIGlmIChidWlsZGVyU3RyID09PSBudWxsIHx8IG9wdGlvbnMgPT09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gb2YobnVsbCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fcmVzb2x2ZUJ1aWxkZXIoYnVpbGRlclN0cikucGlwZShcbiAgICAgICAgICBjb25jYXRNYXAoKGJ1aWxkZXJJbmZvKSA9PiB7XG4gICAgICAgICAgICBpZiAoYnVpbGRlckluZm8gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9mKG51bGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY3JlYXRlQnVpbGRlcihidWlsZGVySW5mbywgdGFyZ2V0LCBvcHRpb25zKTtcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgIH0pLFxuICAgICAgZmlyc3QobnVsbCwgbnVsbCksXG4gICAgKSBhcyBPYnNlcnZhYmxlPEpvYkhhbmRsZXI8QSwgSSwgTz4gfCBudWxsPjtcbiAgfVxufVxuXG5mdW5jdGlvbiBfZ2V0VGFyZ2V0T3B0aW9uc0ZhY3RvcnkoaG9zdDogQXJjaGl0ZWN0SG9zdCkge1xuICByZXR1cm4gY3JlYXRlSm9iSGFuZGxlcjxUYXJnZXQsIGpzb24uSnNvblZhbHVlLCBqc29uLkpzb25PYmplY3Q+KFxuICAgICh0YXJnZXQpID0+IHtcbiAgICAgIHJldHVybiBob3N0LmdldE9wdGlvbnNGb3JUYXJnZXQodGFyZ2V0KS50aGVuKChvcHRpb25zKSA9PiB7XG4gICAgICAgIGlmIChvcHRpb25zID09PSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHRhcmdldDogJHtKU09OLnN0cmluZ2lmeSh0YXJnZXQpfS5gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvcHRpb25zO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiAnLi5nZXRUYXJnZXRPcHRpb25zJyxcbiAgICAgIG91dHB1dDogeyB0eXBlOiAnb2JqZWN0JyB9LFxuICAgICAgYXJndW1lbnQ6IGlucHV0U2NoZW1hLnByb3BlcnRpZXMudGFyZ2V0LFxuICAgIH0sXG4gICk7XG59XG5cbmZ1bmN0aW9uIF9nZXRQcm9qZWN0TWV0YWRhdGFGYWN0b3J5KGhvc3Q6IEFyY2hpdGVjdEhvc3QpIHtcbiAgcmV0dXJuIGNyZWF0ZUpvYkhhbmRsZXI8VGFyZ2V0LCBqc29uLkpzb25WYWx1ZSwganNvbi5Kc29uT2JqZWN0PihcbiAgICAodGFyZ2V0KSA9PiB7XG4gICAgICByZXR1cm4gaG9zdC5nZXRQcm9qZWN0TWV0YWRhdGEodGFyZ2V0KS50aGVuKChvcHRpb25zKSA9PiB7XG4gICAgICAgIGlmIChvcHRpb25zID09PSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHRhcmdldDogJHtKU09OLnN0cmluZ2lmeSh0YXJnZXQpfS5gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvcHRpb25zO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiAnLi5nZXRQcm9qZWN0TWV0YWRhdGEnLFxuICAgICAgb3V0cHV0OiB7IHR5cGU6ICdvYmplY3QnIH0sXG4gICAgICBhcmd1bWVudDoge1xuICAgICAgICBvbmVPZjogW3sgdHlwZTogJ3N0cmluZycgfSwgaW5wdXRTY2hlbWEucHJvcGVydGllcy50YXJnZXRdLFxuICAgICAgfSxcbiAgICB9LFxuICApO1xufVxuXG5mdW5jdGlvbiBfZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXRGYWN0b3J5KGhvc3Q6IEFyY2hpdGVjdEhvc3QpIHtcbiAgcmV0dXJuIGNyZWF0ZUpvYkhhbmRsZXI8VGFyZ2V0LCBuZXZlciwgc3RyaW5nPihcbiAgICBhc3luYyAodGFyZ2V0KSA9PiB7XG4gICAgICBjb25zdCBidWlsZGVyTmFtZSA9IGF3YWl0IGhvc3QuZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXQodGFyZ2V0KTtcbiAgICAgIGlmICghYnVpbGRlck5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBidWlsZGVyIHdlcmUgZm91bmQgZm9yIHRhcmdldCAke3RhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KX0uYCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBidWlsZGVyTmFtZTtcbiAgICB9LFxuICAgIHtcbiAgICAgIG5hbWU6ICcuLmdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0JyxcbiAgICAgIG91dHB1dDogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgYXJndW1lbnQ6IGlucHV0U2NoZW1hLnByb3BlcnRpZXMudGFyZ2V0LFxuICAgIH0sXG4gICk7XG59XG5cbmZ1bmN0aW9uIF92YWxpZGF0ZU9wdGlvbnNGYWN0b3J5KGhvc3Q6IEFyY2hpdGVjdEhvc3QsIHJlZ2lzdHJ5OiBqc29uLnNjaGVtYS5TY2hlbWFSZWdpc3RyeSkge1xuICByZXR1cm4gY3JlYXRlSm9iSGFuZGxlcjxbc3RyaW5nLCBqc29uLkpzb25PYmplY3RdLCBuZXZlciwganNvbi5Kc29uT2JqZWN0PihcbiAgICBhc3luYyAoW2J1aWxkZXJOYW1lLCBvcHRpb25zXSkgPT4ge1xuICAgICAgLy8gR2V0IG9wdGlvbiBzY2hlbWEgZnJvbSB0aGUgaG9zdC5cbiAgICAgIGNvbnN0IGJ1aWxkZXJJbmZvID0gYXdhaXQgaG9zdC5yZXNvbHZlQnVpbGRlcihidWlsZGVyTmFtZSk7XG4gICAgICBpZiAoIWJ1aWxkZXJJbmZvKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gYnVpbGRlciBpbmZvIHdlcmUgZm91bmQgZm9yIGJ1aWxkZXIgJHtKU09OLnN0cmluZ2lmeShidWlsZGVyTmFtZSl9LmApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB2YWxpZGF0aW9uID0gYXdhaXQgcmVnaXN0cnkuY29tcGlsZShidWlsZGVySW5mby5vcHRpb25TY2hlbWEpO1xuICAgICAgY29uc3QgeyBkYXRhLCBzdWNjZXNzLCBlcnJvcnMgfSA9IGF3YWl0IHZhbGlkYXRpb24ob3B0aW9ucyk7XG5cbiAgICAgIGlmICghc3VjY2Vzcykge1xuICAgICAgICB0aHJvdyBuZXcganNvbi5zY2hlbWEuU2NoZW1hVmFsaWRhdGlvbkV4Y2VwdGlvbihlcnJvcnMpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZGF0YSBhcyBqc29uLkpzb25PYmplY3Q7XG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiAnLi52YWxpZGF0ZU9wdGlvbnMnLFxuICAgICAgb3V0cHV0OiB7IHR5cGU6ICdvYmplY3QnIH0sXG4gICAgICBhcmd1bWVudDoge1xuICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICBpdGVtczogW3sgdHlwZTogJ3N0cmluZycgfSwgeyB0eXBlOiAnb2JqZWN0JyB9XSxcbiAgICAgIH0sXG4gICAgfSxcbiAgKTtcbn1cblxuZXhwb3J0IGNsYXNzIEFyY2hpdGVjdCB7XG4gIHByaXZhdGUgcmVhZG9ubHkgX3NjaGVkdWxlcjogU2NoZWR1bGVyO1xuICBwcml2YXRlIHJlYWRvbmx5IF9qb2JDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnNlcnZhYmxlPEJ1aWxkZXJKb2JIYW5kbGVyPj4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBfaW5mb0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic2VydmFibGU8QnVpbGRlckluZm8+PigpO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgX2hvc3Q6IEFyY2hpdGVjdEhvc3QsXG4gICAgcmVnaXN0cnk6IGpzb24uc2NoZW1hLlNjaGVtYVJlZ2lzdHJ5ID0gbmV3IGpzb24uc2NoZW1hLkNvcmVTY2hlbWFSZWdpc3RyeSgpLFxuICAgIGFkZGl0aW9uYWxKb2JSZWdpc3RyeT86IFJlZ2lzdHJ5LFxuICApIHtcbiAgICBjb25zdCBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnkgPSBuZXcgU2ltcGxlSm9iUmVnaXN0cnkoKTtcbiAgICAvLyBDcmVhdGUgcHJpdmF0ZSBqb2JzLlxuICAgIHByaXZhdGVBcmNoaXRlY3RKb2JSZWdpc3RyeS5yZWdpc3RlcihfZ2V0VGFyZ2V0T3B0aW9uc0ZhY3RvcnkoX2hvc3QpKTtcbiAgICBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnkucmVnaXN0ZXIoX2dldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0RmFjdG9yeShfaG9zdCkpO1xuICAgIHByaXZhdGVBcmNoaXRlY3RKb2JSZWdpc3RyeS5yZWdpc3RlcihfdmFsaWRhdGVPcHRpb25zRmFjdG9yeShfaG9zdCwgcmVnaXN0cnkpKTtcbiAgICBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnkucmVnaXN0ZXIoX2dldFByb2plY3RNZXRhZGF0YUZhY3RvcnkoX2hvc3QpKTtcblxuICAgIGNvbnN0IGpvYlJlZ2lzdHJ5ID0gbmV3IEZhbGxiYWNrUmVnaXN0cnkoW1xuICAgICAgbmV3IEFyY2hpdGVjdFRhcmdldEpvYlJlZ2lzdHJ5KF9ob3N0LCByZWdpc3RyeSwgdGhpcy5fam9iQ2FjaGUsIHRoaXMuX2luZm9DYWNoZSksXG4gICAgICBuZXcgQXJjaGl0ZWN0QnVpbGRlckpvYlJlZ2lzdHJ5KF9ob3N0LCByZWdpc3RyeSwgdGhpcy5fam9iQ2FjaGUsIHRoaXMuX2luZm9DYWNoZSksXG4gICAgICBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnksXG4gICAgICAuLi4oYWRkaXRpb25hbEpvYlJlZ2lzdHJ5ID8gW2FkZGl0aW9uYWxKb2JSZWdpc3RyeV0gOiBbXSksXG4gICAgXSBhcyBSZWdpc3RyeVtdKTtcblxuICAgIHRoaXMuX3NjaGVkdWxlciA9IG5ldyBTaW1wbGVTY2hlZHVsZXIoam9iUmVnaXN0cnksIHJlZ2lzdHJ5KTtcbiAgfVxuXG4gIGhhcyhuYW1lOiBKb2JOYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVkdWxlci5oYXMobmFtZSk7XG4gIH1cblxuICBzY2hlZHVsZUJ1aWxkZXIoXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG9wdGlvbnM6IGpzb24uSnNvbk9iamVjdCxcbiAgICBzY2hlZHVsZU9wdGlvbnM6IFNjaGVkdWxlT3B0aW9ucyA9IHt9LFxuICApOiBQcm9taXNlPEJ1aWxkZXJSdW4+IHtcbiAgICAvLyBUaGUgYmVsb3cgd2lsbCBtYXRjaCAncHJvamVjdDp0YXJnZXQ6Y29uZmlndXJhdGlvbidcbiAgICBpZiAoIS9eW146XSs6W146XSsoOlteOl0rKT8kLy50ZXN0KG5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYnVpbGRlciBuYW1lOiAnICsgSlNPTi5zdHJpbmdpZnkobmFtZSkpO1xuICAgIH1cblxuICAgIHJldHVybiBzY2hlZHVsZUJ5TmFtZShuYW1lLCBvcHRpb25zLCB7XG4gICAgICBzY2hlZHVsZXI6IHRoaXMuX3NjaGVkdWxlcixcbiAgICAgIGxvZ2dlcjogc2NoZWR1bGVPcHRpb25zLmxvZ2dlciB8fCBuZXcgbG9nZ2luZy5OdWxsTG9nZ2VyKCksXG4gICAgICBjdXJyZW50RGlyZWN0b3J5OiB0aGlzLl9ob3N0LmdldEN1cnJlbnREaXJlY3RvcnkoKSxcbiAgICAgIHdvcmtzcGFjZVJvb3Q6IHRoaXMuX2hvc3QuZ2V0V29ya3NwYWNlUm9vdCgpLFxuICAgIH0pO1xuICB9XG4gIHNjaGVkdWxlVGFyZ2V0KFxuICAgIHRhcmdldDogVGFyZ2V0LFxuICAgIG92ZXJyaWRlczoganNvbi5Kc29uT2JqZWN0ID0ge30sXG4gICAgc2NoZWR1bGVPcHRpb25zOiBTY2hlZHVsZU9wdGlvbnMgPSB7fSxcbiAgKTogUHJvbWlzZTxCdWlsZGVyUnVuPiB7XG4gICAgcmV0dXJuIHNjaGVkdWxlQnlUYXJnZXQodGFyZ2V0LCBvdmVycmlkZXMsIHtcbiAgICAgIHNjaGVkdWxlcjogdGhpcy5fc2NoZWR1bGVyLFxuICAgICAgbG9nZ2VyOiBzY2hlZHVsZU9wdGlvbnMubG9nZ2VyIHx8IG5ldyBsb2dnaW5nLk51bGxMb2dnZXIoKSxcbiAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IHRoaXMuX2hvc3QuZ2V0Q3VycmVudERpcmVjdG9yeSgpLFxuICAgICAgd29ya3NwYWNlUm9vdDogdGhpcy5faG9zdC5nZXRXb3Jrc3BhY2VSb290KCksXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==