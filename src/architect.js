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
        const inboundBusWithInputValidation = context.inboundBus.pipe((0, rxjs_1.concatMap)(async (message) => {
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
        (0, rxjs_1.shareReplay)(1));
        // Make an inboundBus that completes instead of erroring out.
        // We'll merge the errors into the output instead.
        const inboundBus = (0, rxjs_1.onErrorResumeNext)(inboundBusWithInputValidation);
        const output = (0, rxjs_1.from)(host.loadBuilder(info)).pipe((0, rxjs_1.concatMap)((builder) => {
            if (builder === null) {
                throw new Error(`Cannot load builder for builderInfo ${JSON.stringify(info, null, 2)}`);
            }
            return builder.handler(argument, { ...context, inboundBus }).pipe((0, rxjs_1.map)((output) => {
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
        // Share subscriptions to the output, otherwise the handler will be re-run.
        (0, rxjs_1.shareReplay)());
        // Separate the errors from the inbound bus into their own observable that completes when the
        // builder output does.
        const inboundBusErrors = inboundBusWithInputValidation.pipe((0, rxjs_1.ignoreElements)(), (0, rxjs_1.takeUntil)((0, rxjs_1.onErrorResumeNext)(output.pipe((0, rxjs_1.last)()))));
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
            const info = (0, rxjs_1.from)(this._host.resolveBuilder(name)).pipe((0, rxjs_1.shareReplay)(1));
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
                cache.set((0, api_1.targetStringFromTarget)(target), result.pipe((0, rxjs_1.shareReplay)(1)));
            }
            else {
                cache.set(info.builderName, result.pipe((0, rxjs_1.shareReplay)(1)));
            }
        }
        return result;
    }
    get(name) {
        const m = name.match(/^([^:]+):([^:]+)$/i);
        if (!m) {
            return (0, rxjs_1.of)(null);
        }
        return (0, rxjs_1.from)(this._resolveBuilder(name)).pipe((0, rxjs_1.concatMap)((builderInfo) => (builderInfo ? this._createBuilder(builderInfo) : (0, rxjs_1.of)(null))), (0, rxjs_1.first)(null, null));
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
        ])).pipe((0, rxjs_1.concatMap)(([builderStr, options]) => {
            if (builderStr === null || options === null) {
                return (0, rxjs_1.of)(null);
            }
            return this._resolveBuilder(builderStr).pipe((0, rxjs_1.concatMap)((builderInfo) => {
                if (builderInfo === null) {
                    return (0, rxjs_1.of)(null);
                }
                return this._createBuilder(builderInfo, target, options);
            }));
        }), (0, rxjs_1.first)(null, null));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjaGl0ZWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L3NyYy9hcmNoaXRlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBRUgsK0NBQXFEO0FBQ3JELCtCQWFjO0FBQ2QsK0JBUWU7QUFFZixpQ0FhZ0I7QUFDaEIseURBQXNFO0FBRXRFLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQ25ELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0FBRXJELFNBQVMsZ0NBQWdDLENBQ3ZDLElBQWlCLEVBQ2pCLE1BQTBCLEVBQzFCLElBQW1CLEVBQ25CLFFBQW9DLEVBQ3BDLFdBQTRCO0lBRTVCLE1BQU0sY0FBYyxHQUF1QjtRQUN6QyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUEsNEJBQXNCLEVBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7UUFDdkUsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtRQUM1QixLQUFLLEVBQUUsV0FBVztRQUNsQixNQUFNLEVBQUUsWUFBWTtRQUNwQixJQUFJO0tBQ0wsQ0FBQztJQUVGLFNBQVMsT0FBTyxDQUFDLFFBQXlCLEVBQUUsT0FBMEI7UUFDcEUsMkNBQTJDO1FBQzNDLE1BQU0sNkJBQTZCLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQzNELElBQUEsZ0JBQVMsRUFBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDMUIsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLDRCQUFxQixDQUFDLEtBQUssRUFBRTtnQkFDaEQsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLEtBQXFCLENBQUM7Z0JBQ3hDLE1BQU0sT0FBTyxHQUFHO29CQUNkLEdBQUcsV0FBVztvQkFDZCxHQUFHLENBQUMsQ0FBQyxPQUFPO2lCQUNiLENBQUM7Z0JBRUYseUNBQXlDO2dCQUN6QyxNQUFNLFVBQVUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUM3RCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztnQkFFbkQsSUFBSSxDQUFDLE9BQU8sRUFBRTtvQkFDWixNQUFNLElBQUksV0FBSSxDQUFDLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztpQkFDekQ7Z0JBRUQsT0FBTyxFQUFFLEdBQUcsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBcUMsQ0FBQzthQUMxRjtpQkFBTTtnQkFDTCxPQUFPLE9BQTBDLENBQUM7YUFDbkQ7UUFDSCxDQUFDLENBQUM7UUFDRixpRkFBaUY7UUFDakYsa0NBQWtDO1FBQ2xDLElBQUEsa0JBQVcsRUFBQyxDQUFDLENBQUMsQ0FDZixDQUFDO1FBRUYsNkRBQTZEO1FBQzdELGtEQUFrRDtRQUNsRCxNQUFNLFVBQVUsR0FBRyxJQUFBLHdCQUFpQixFQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFcEUsTUFBTSxNQUFNLEdBQUcsSUFBQSxXQUFJLEVBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FDOUMsSUFBQSxnQkFBUyxFQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDcEIsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFO2dCQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLHVDQUF1QyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ3pGO1lBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLEdBQUcsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUMvRCxJQUFBLFVBQUcsRUFBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUNiLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyw2QkFBc0IsQ0FBQyxNQUFNLEVBQUU7b0JBQ2pELG9CQUFvQjtvQkFDcEIsT0FBTzt3QkFDTCxHQUFHLE1BQU07d0JBQ1QsS0FBSyxFQUFFOzRCQUNMLEdBQUcsTUFBTSxDQUFDLEtBQUs7NEJBQ2YsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3lCQUNDO3FCQUNoQyxDQUFDO2lCQUNIO3FCQUFNO29CQUNMLE9BQU8sTUFBTSxDQUFDO2lCQUNmO1lBQ0gsQ0FBQyxDQUFDLENBQ0gsQ0FBQztRQUNKLENBQUMsQ0FBQztRQUNGLDJFQUEyRTtRQUMzRSxJQUFBLGtCQUFXLEdBQUUsQ0FDZCxDQUFDO1FBRUYsNkZBQTZGO1FBQzdGLHVCQUF1QjtRQUN2QixNQUFNLGdCQUFnQixHQUFHLDZCQUE2QixDQUFDLElBQUksQ0FDekQsSUFBQSxxQkFBYyxHQUFFLEVBQ2hCLElBQUEsZ0JBQVMsRUFBQyxJQUFBLHdCQUFpQixFQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBQSxXQUFJLEdBQUUsQ0FBQyxDQUFDLENBQUMsQ0FDbEQsQ0FBQztRQUVGLG1EQUFtRDtRQUNuRCxPQUFPLElBQUEsWUFBSyxFQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFRCxPQUFPLElBQUEsU0FBRSxFQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQXNCLENBQUMsQ0FBQztBQUM3RSxDQUFDO0FBTUQ7O0dBRUc7QUFDSCxNQUFNLDJCQUEyQjtJQUMvQixZQUNZLEtBQW9CLEVBQ3BCLFNBQXFDLEVBQ3JDLFNBQTZELEVBQzdELFVBQXdEO1FBSHhELFVBQUssR0FBTCxLQUFLLENBQWU7UUFDcEIsY0FBUyxHQUFULFNBQVMsQ0FBNEI7UUFDckMsY0FBUyxHQUFULFNBQVMsQ0FBb0Q7UUFDN0QsZUFBVSxHQUFWLFVBQVUsQ0FBOEM7SUFDakUsQ0FBQztJQUVNLGVBQWUsQ0FBQyxJQUFZO1FBQ3BDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDOUIsSUFBSSxLQUFLLEVBQUU7WUFDVCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLElBQUksVUFBVSxLQUFLLFNBQVMsRUFBRTtnQkFDNUIsT0FBTyxVQUFVLENBQUM7YUFDbkI7WUFFRCxNQUFNLElBQUksR0FBRyxJQUFBLFdBQUksRUFBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFBLGtCQUFXLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4RSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztZQUV0QixPQUFPLElBQUksQ0FBQztTQUNiO1FBRUQsT0FBTyxJQUFBLFdBQUksRUFBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFUyxjQUFjLENBQ3RCLElBQWlCLEVBQ2pCLE1BQWUsRUFDZixPQUF5QjtRQUV6QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQzdCLElBQUksTUFBTSxFQUFFO1lBQ1YsTUFBTSxRQUFRLEdBQUcsS0FBSyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBQSw0QkFBc0IsRUFBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLElBQUksUUFBUSxFQUFFO2dCQUNaLE9BQU8sUUFBUSxDQUFDO2FBQ2pCO1NBQ0Y7YUFBTTtZQUNMLE1BQU0sUUFBUSxHQUFHLEtBQUssSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN0RCxJQUFJLFFBQVEsRUFBRTtnQkFDWixPQUFPLFFBQVEsQ0FBQzthQUNqQjtTQUNGO1FBRUQsTUFBTSxNQUFNLEdBQUcsZ0NBQWdDLENBQzdDLElBQUksRUFDSixNQUFNLEVBQ04sSUFBSSxDQUFDLEtBQUssRUFDVixJQUFJLENBQUMsU0FBUyxFQUNkLE9BQU8sSUFBSSxFQUFFLENBQ2QsQ0FBQztRQUVGLElBQUksS0FBSyxFQUFFO1lBQ1QsSUFBSSxNQUFNLEVBQUU7Z0JBQ1YsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFBLDRCQUFzQixFQUFDLE1BQU0sQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBQSxrQkFBVyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUN4RTtpQkFBTTtnQkFDTCxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFBLGtCQUFXLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzFEO1NBQ0Y7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQsR0FBRyxDQUNELElBQVk7UUFFWixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLENBQUMsRUFBRTtZQUNOLE9BQU8sSUFBQSxTQUFFLEVBQUMsSUFBSSxDQUFDLENBQUM7U0FDakI7UUFFRCxPQUFPLElBQUEsV0FBSSxFQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQzFDLElBQUEsZ0JBQVMsRUFBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUEsU0FBRSxFQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFDdkYsSUFBQSxZQUFLLEVBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUN3QixDQUFDO0lBQzlDLENBQUM7Q0FDRjtBQUVEOztHQUVHO0FBQ0gsTUFBTSwwQkFBMkIsU0FBUSwyQkFBMkI7SUFDekQsR0FBRyxDQUNWLElBQVk7UUFFWixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLENBQUMsRUFBRTtZQUNOLE9BQU8sSUFBQSxTQUFFLEVBQUMsSUFBSSxDQUFDLENBQUM7U0FDakI7UUFFRCxNQUFNLE1BQU0sR0FBRztZQUNiLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2IsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDWixhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNwQixDQUFDO1FBRUYsT0FBTyxJQUFBLFdBQUksRUFDVCxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQ1YsSUFBSSxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUM7WUFDMUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUM7U0FDdkMsQ0FBQyxDQUNILENBQUMsSUFBSSxDQUNKLElBQUEsZ0JBQVMsRUFBQyxDQUFDLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUU7WUFDbEMsSUFBSSxVQUFVLEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUU7Z0JBQzNDLE9BQU8sSUFBQSxTQUFFLEVBQUMsSUFBSSxDQUFDLENBQUM7YUFDakI7WUFFRCxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUMxQyxJQUFBLGdCQUFTLEVBQUMsQ0FBQyxXQUFXLEVBQUUsRUFBRTtnQkFDeEIsSUFBSSxXQUFXLEtBQUssSUFBSSxFQUFFO29CQUN4QixPQUFPLElBQUEsU0FBRSxFQUFDLElBQUksQ0FBQyxDQUFDO2lCQUNqQjtnQkFFRCxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMzRCxDQUFDLENBQUMsQ0FDSCxDQUFDO1FBQ0osQ0FBQyxDQUFDLEVBQ0YsSUFBQSxZQUFLLEVBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUN3QixDQUFDO0lBQzlDLENBQUM7Q0FDRjtBQUVELFNBQVMsd0JBQXdCLENBQUMsSUFBbUI7SUFDbkQsT0FBTyxJQUFBLHVCQUFnQixFQUNyQixDQUFDLE1BQU0sRUFBRSxFQUFFO1FBQ1QsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDdkQsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFO2dCQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUMvRDtZQUVELE9BQU8sT0FBTyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxFQUNEO1FBQ0UsSUFBSSxFQUFFLG9CQUFvQjtRQUMxQixNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBQzFCLFFBQVEsRUFBRSxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU07S0FDeEMsQ0FDRixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsMEJBQTBCLENBQUMsSUFBbUI7SUFDckQsT0FBTyxJQUFBLHVCQUFnQixFQUNyQixDQUFDLE1BQU0sRUFBRSxFQUFFO1FBQ1QsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDdEQsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFO2dCQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUMvRDtZQUVELE9BQU8sT0FBTyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxFQUNEO1FBQ0UsSUFBSSxFQUFFLHNCQUFzQjtRQUM1QixNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBQzFCLFFBQVEsRUFBRTtZQUNSLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDO1NBQzNEO0tBQ0YsQ0FDRixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsK0JBQStCLENBQUMsSUFBbUI7SUFDMUQsT0FBTyxJQUFBLHVCQUFnQixFQUNyQixLQUFLLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDZixNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLElBQUEsNEJBQXNCLEVBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3hGO1FBRUQsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQyxFQUNEO1FBQ0UsSUFBSSxFQUFFLDJCQUEyQjtRQUNqQyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBQzFCLFFBQVEsRUFBRSxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU07S0FDeEMsQ0FDRixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQUMsSUFBbUIsRUFBRSxRQUFvQztJQUN4RixPQUFPLElBQUEsdUJBQWdCLEVBQ3JCLEtBQUssRUFBRSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsRUFBRSxFQUFFO1FBQy9CLG1DQUFtQztRQUNuQyxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixNQUFNLElBQUksS0FBSyxDQUFDLDBDQUEwQyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUMzRjtRQUVELE1BQU0sVUFBVSxHQUFHLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDcEUsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFNUQsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNaLE1BQU0sSUFBSSxXQUFJLENBQUMsTUFBTSxDQUFDLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ3pEO1FBRUQsT0FBTyxJQUF1QixDQUFDO0lBQ2pDLENBQUMsRUFDRDtRQUNFLElBQUksRUFBRSxtQkFBbUI7UUFDekIsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtRQUMxQixRQUFRLEVBQUU7WUFDUixJQUFJLEVBQUUsT0FBTztZQUNiLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDO1NBQ2hEO0tBQ0YsQ0FDRixDQUFDO0FBQ0osQ0FBQztBQUVELE1BQWEsU0FBUztJQUtwQixZQUNVLEtBQW9CLEVBQzVCLFdBQXVDLElBQUksV0FBSSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxFQUMzRSxxQkFBZ0M7UUFGeEIsVUFBSyxHQUFMLEtBQUssQ0FBZTtRQUpiLGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBeUMsQ0FBQztRQUM3RCxlQUFVLEdBQUcsSUFBSSxHQUFHLEVBQW1DLENBQUM7UUFPdkUsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLHdCQUFpQixFQUFFLENBQUM7UUFDNUQsdUJBQXVCO1FBQ3ZCLDJCQUEyQixDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLDJCQUEyQixDQUFDLFFBQVEsQ0FBQywrQkFBK0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzdFLDJCQUEyQixDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUMvRSwyQkFBMkIsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV4RSxNQUFNLFdBQVcsR0FBRyxJQUFJLHVCQUFnQixDQUFDO1lBQ3ZDLElBQUksMEJBQTBCLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDaEYsSUFBSSwyQkFBMkIsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUNqRiwyQkFBMkI7WUFDM0IsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztTQUM1QyxDQUFDLENBQUM7UUFFakIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLHNCQUFlLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFRCxHQUFHLENBQUMsSUFBYTtRQUNmLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELGVBQWUsQ0FDYixJQUFZLEVBQ1osT0FBd0IsRUFDeEIsa0JBQW1DLEVBQUU7UUFFckMsc0RBQXNEO1FBQ3RELElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDeEMsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7U0FDbEU7UUFFRCxPQUFPLElBQUEsaUNBQWMsRUFBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQ25DLFNBQVMsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMxQixNQUFNLEVBQUUsZUFBZSxDQUFDLE1BQU0sSUFBSSxJQUFJLGNBQU8sQ0FBQyxVQUFVLEVBQUU7WUFDMUQsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRTtZQUNsRCxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtTQUM3QyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsY0FBYyxDQUNaLE1BQWMsRUFDZCxZQUE2QixFQUFFLEVBQy9CLGtCQUFtQyxFQUFFO1FBRXJDLE9BQU8sSUFBQSxtQ0FBZ0IsRUFBQyxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQ3pDLFNBQVMsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMxQixNQUFNLEVBQUUsZUFBZSxDQUFDLE1BQU0sSUFBSSxJQUFJLGNBQU8sQ0FBQyxVQUFVLEVBQUU7WUFDMUQsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRTtZQUNsRCxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtTQUM3QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1REQsOEJBNERDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IGpzb24sIGxvZ2dpbmcgfSBmcm9tICdAYW5ndWxhci1kZXZraXQvY29yZSc7XG5pbXBvcnQge1xuICBPYnNlcnZhYmxlLFxuICBjb25jYXRNYXAsXG4gIGZpcnN0LFxuICBmcm9tLFxuICBpZ25vcmVFbGVtZW50cyxcbiAgbGFzdCxcbiAgbWFwLFxuICBtZXJnZSxcbiAgb2YsXG4gIG9uRXJyb3JSZXN1bWVOZXh0LFxuICBzaGFyZVJlcGxheSxcbiAgdGFrZVVudGlsLFxufSBmcm9tICdyeGpzJztcbmltcG9ydCB7XG4gIEJ1aWxkZXJJbmZvLFxuICBCdWlsZGVySW5wdXQsXG4gIEJ1aWxkZXJPdXRwdXQsXG4gIEJ1aWxkZXJSZWdpc3RyeSxcbiAgQnVpbGRlclJ1bixcbiAgVGFyZ2V0LFxuICB0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0LFxufSBmcm9tICcuL2FwaSc7XG5pbXBvcnQgeyBBcmNoaXRlY3RIb3N0LCBCdWlsZGVyRGVzY3JpcHRpb24sIEJ1aWxkZXJKb2JIYW5kbGVyIH0gZnJvbSAnLi9pbnRlcm5hbCc7XG5pbXBvcnQge1xuICBGYWxsYmFja1JlZ2lzdHJ5LFxuICBKb2JIYW5kbGVyLFxuICBKb2JIYW5kbGVyQ29udGV4dCxcbiAgSm9iSW5ib3VuZE1lc3NhZ2UsXG4gIEpvYkluYm91bmRNZXNzYWdlS2luZCxcbiAgSm9iTmFtZSxcbiAgSm9iT3V0Ym91bmRNZXNzYWdlS2luZCxcbiAgUmVnaXN0cnksXG4gIFNjaGVkdWxlcixcbiAgU2ltcGxlSm9iUmVnaXN0cnksXG4gIFNpbXBsZVNjaGVkdWxlcixcbiAgY3JlYXRlSm9iSGFuZGxlcixcbn0gZnJvbSAnLi9qb2JzJztcbmltcG9ydCB7IHNjaGVkdWxlQnlOYW1lLCBzY2hlZHVsZUJ5VGFyZ2V0IH0gZnJvbSAnLi9zY2hlZHVsZS1ieS1uYW1lJztcblxuY29uc3QgaW5wdXRTY2hlbWEgPSByZXF1aXJlKCcuL2lucHV0LXNjaGVtYS5qc29uJyk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSByZXF1aXJlKCcuL291dHB1dC1zY2hlbWEuanNvbicpO1xuXG5mdW5jdGlvbiBfY3JlYXRlSm9iSGFuZGxlckZyb21CdWlsZGVySW5mbyhcbiAgaW5mbzogQnVpbGRlckluZm8sXG4gIHRhcmdldDogVGFyZ2V0IHwgdW5kZWZpbmVkLFxuICBob3N0OiBBcmNoaXRlY3RIb3N0LFxuICByZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnksXG4gIGJhc2VPcHRpb25zOiBqc29uLkpzb25PYmplY3QsXG4pOiBPYnNlcnZhYmxlPEJ1aWxkZXJKb2JIYW5kbGVyPiB7XG4gIGNvbnN0IGpvYkRlc2NyaXB0aW9uOiBCdWlsZGVyRGVzY3JpcHRpb24gPSB7XG4gICAgbmFtZTogdGFyZ2V0ID8gYHske3RhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KX19YCA6IGluZm8uYnVpbGRlck5hbWUsXG4gICAgYXJndW1lbnQ6IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gICAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gICAgaW5mbyxcbiAgfTtcblxuICBmdW5jdGlvbiBoYW5kbGVyKGFyZ3VtZW50OiBqc29uLkpzb25PYmplY3QsIGNvbnRleHQ6IEpvYkhhbmRsZXJDb250ZXh0KSB7XG4gICAgLy8gQWRkIGlucHV0IHZhbGlkYXRpb24gdG8gdGhlIGluYm91bmQgYnVzLlxuICAgIGNvbnN0IGluYm91bmRCdXNXaXRoSW5wdXRWYWxpZGF0aW9uID0gY29udGV4dC5pbmJvdW5kQnVzLnBpcGUoXG4gICAgICBjb25jYXRNYXAoYXN5bmMgKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgaWYgKG1lc3NhZ2Uua2luZCA9PT0gSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLklucHV0KSB7XG4gICAgICAgICAgY29uc3QgdiA9IG1lc3NhZ2UudmFsdWUgYXMgQnVpbGRlcklucHV0O1xuICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAuLi5iYXNlT3B0aW9ucyxcbiAgICAgICAgICAgIC4uLnYub3B0aW9ucyxcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgdiBhZ2FpbnN0IHRoZSBvcHRpb25zIHNjaGVtYS5cbiAgICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gYXdhaXQgcmVnaXN0cnkuY29tcGlsZShpbmZvLm9wdGlvblNjaGVtYSk7XG4gICAgICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRpb24ob3B0aW9ucyk7XG4gICAgICAgICAgY29uc3QgeyBkYXRhLCBzdWNjZXNzLCBlcnJvcnMgfSA9IHZhbGlkYXRpb25SZXN1bHQ7XG5cbiAgICAgICAgICBpZiAoIXN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBqc29uLnNjaGVtYS5TY2hlbWFWYWxpZGF0aW9uRXhjZXB0aW9uKGVycm9ycyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHsgLi4ubWVzc2FnZSwgdmFsdWU6IHsgLi4udiwgb3B0aW9uczogZGF0YSB9IH0gYXMgSm9iSW5ib3VuZE1lc3NhZ2U8QnVpbGRlcklucHV0PjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbWVzc2FnZSBhcyBKb2JJbmJvdW5kTWVzc2FnZTxCdWlsZGVySW5wdXQ+O1xuICAgICAgICB9XG4gICAgICB9KSxcbiAgICAgIC8vIFVzaW5nIGEgc2hhcmUgcmVwbGF5IGJlY2F1c2UgdGhlIGpvYiBtaWdodCBiZSBzeW5jaHJvbm91c2x5IHNlbmRpbmcgaW5wdXQsIGJ1dFxuICAgICAgLy8gYXN5bmNocm9ub3VzbHkgbGlzdGVuaW5nIHRvIGl0LlxuICAgICAgc2hhcmVSZXBsYXkoMSksXG4gICAgKTtcblxuICAgIC8vIE1ha2UgYW4gaW5ib3VuZEJ1cyB0aGF0IGNvbXBsZXRlcyBpbnN0ZWFkIG9mIGVycm9yaW5nIG91dC5cbiAgICAvLyBXZSdsbCBtZXJnZSB0aGUgZXJyb3JzIGludG8gdGhlIG91dHB1dCBpbnN0ZWFkLlxuICAgIGNvbnN0IGluYm91bmRCdXMgPSBvbkVycm9yUmVzdW1lTmV4dChpbmJvdW5kQnVzV2l0aElucHV0VmFsaWRhdGlvbik7XG5cbiAgICBjb25zdCBvdXRwdXQgPSBmcm9tKGhvc3QubG9hZEJ1aWxkZXIoaW5mbykpLnBpcGUoXG4gICAgICBjb25jYXRNYXAoKGJ1aWxkZXIpID0+IHtcbiAgICAgICAgaWYgKGJ1aWxkZXIgPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBsb2FkIGJ1aWxkZXIgZm9yIGJ1aWxkZXJJbmZvICR7SlNPTi5zdHJpbmdpZnkoaW5mbywgbnVsbCwgMil9YCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYnVpbGRlci5oYW5kbGVyKGFyZ3VtZW50LCB7IC4uLmNvbnRleHQsIGluYm91bmRCdXMgfSkucGlwZShcbiAgICAgICAgICBtYXAoKG91dHB1dCkgPT4ge1xuICAgICAgICAgICAgaWYgKG91dHB1dC5raW5kID09PSBKb2JPdXRib3VuZE1lc3NhZ2VLaW5kLk91dHB1dCkge1xuICAgICAgICAgICAgICAvLyBBZGQgdGFyZ2V0IHRvIGl0LlxuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLm91dHB1dCxcbiAgICAgICAgICAgICAgICB2YWx1ZToge1xuICAgICAgICAgICAgICAgICAgLi4ub3V0cHV0LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgLi4uKHRhcmdldCA/IHsgdGFyZ2V0IH0gOiAwKSxcbiAgICAgICAgICAgICAgICB9IGFzIHVua25vd24gYXMganNvbi5Kc29uT2JqZWN0LFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG91dHB1dDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgIH0pLFxuICAgICAgLy8gU2hhcmUgc3Vic2NyaXB0aW9ucyB0byB0aGUgb3V0cHV0LCBvdGhlcndpc2UgdGhlIGhhbmRsZXIgd2lsbCBiZSByZS1ydW4uXG4gICAgICBzaGFyZVJlcGxheSgpLFxuICAgICk7XG5cbiAgICAvLyBTZXBhcmF0ZSB0aGUgZXJyb3JzIGZyb20gdGhlIGluYm91bmQgYnVzIGludG8gdGhlaXIgb3duIG9ic2VydmFibGUgdGhhdCBjb21wbGV0ZXMgd2hlbiB0aGVcbiAgICAvLyBidWlsZGVyIG91dHB1dCBkb2VzLlxuICAgIGNvbnN0IGluYm91bmRCdXNFcnJvcnMgPSBpbmJvdW5kQnVzV2l0aElucHV0VmFsaWRhdGlvbi5waXBlKFxuICAgICAgaWdub3JlRWxlbWVudHMoKSxcbiAgICAgIHRha2VVbnRpbChvbkVycm9yUmVzdW1lTmV4dChvdXRwdXQucGlwZShsYXN0KCkpKSksXG4gICAgKTtcblxuICAgIC8vIFJldHVybiB0aGUgYnVpbGRlciBvdXRwdXQgcGx1cyBhbnkgaW5wdXQgZXJyb3JzLlxuICAgIHJldHVybiBtZXJnZShpbmJvdW5kQnVzRXJyb3JzLCBvdXRwdXQpO1xuICB9XG5cbiAgcmV0dXJuIG9mKE9iamVjdC5hc3NpZ24oaGFuZGxlciwgeyBqb2JEZXNjcmlwdGlvbiB9KSBhcyBCdWlsZGVySm9iSGFuZGxlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NoZWR1bGVPcHRpb25zIHtcbiAgbG9nZ2VyPzogbG9nZ2luZy5Mb2dnZXI7XG59XG5cbi8qKlxuICogQSBKb2JSZWdpc3RyeSB0aGF0IHJlc29sdmVzIGJ1aWxkZXIgdGFyZ2V0cyBmcm9tIHRoZSBob3N0LlxuICovXG5jbGFzcyBBcmNoaXRlY3RCdWlsZGVySm9iUmVnaXN0cnkgaW1wbGVtZW50cyBCdWlsZGVyUmVnaXN0cnkge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcm90ZWN0ZWQgX2hvc3Q6IEFyY2hpdGVjdEhvc3QsXG4gICAgcHJvdGVjdGVkIF9yZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnksXG4gICAgcHJvdGVjdGVkIF9qb2JDYWNoZT86IE1hcDxzdHJpbmcsIE9ic2VydmFibGU8QnVpbGRlckpvYkhhbmRsZXIgfCBudWxsPj4sXG4gICAgcHJvdGVjdGVkIF9pbmZvQ2FjaGU/OiBNYXA8c3RyaW5nLCBPYnNlcnZhYmxlPEJ1aWxkZXJJbmZvIHwgbnVsbD4+LFxuICApIHt9XG5cbiAgcHJvdGVjdGVkIF9yZXNvbHZlQnVpbGRlcihuYW1lOiBzdHJpbmcpOiBPYnNlcnZhYmxlPEJ1aWxkZXJJbmZvIHwgbnVsbD4ge1xuICAgIGNvbnN0IGNhY2hlID0gdGhpcy5faW5mb0NhY2hlO1xuICAgIGlmIChjYWNoZSkge1xuICAgICAgY29uc3QgbWF5YmVDYWNoZSA9IGNhY2hlLmdldChuYW1lKTtcbiAgICAgIGlmIChtYXliZUNhY2hlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG1heWJlQ2FjaGU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGluZm8gPSBmcm9tKHRoaXMuX2hvc3QucmVzb2x2ZUJ1aWxkZXIobmFtZSkpLnBpcGUoc2hhcmVSZXBsYXkoMSkpO1xuICAgICAgY2FjaGUuc2V0KG5hbWUsIGluZm8pO1xuXG4gICAgICByZXR1cm4gaW5mbztcbiAgICB9XG5cbiAgICByZXR1cm4gZnJvbSh0aGlzLl9ob3N0LnJlc29sdmVCdWlsZGVyKG5hbWUpKTtcbiAgfVxuXG4gIHByb3RlY3RlZCBfY3JlYXRlQnVpbGRlcihcbiAgICBpbmZvOiBCdWlsZGVySW5mbyxcbiAgICB0YXJnZXQ/OiBUYXJnZXQsXG4gICAgb3B0aW9ucz86IGpzb24uSnNvbk9iamVjdCxcbiAgKTogT2JzZXJ2YWJsZTxCdWlsZGVySm9iSGFuZGxlciB8IG51bGw+IHtcbiAgICBjb25zdCBjYWNoZSA9IHRoaXMuX2pvYkNhY2hlO1xuICAgIGlmICh0YXJnZXQpIHtcbiAgICAgIGNvbnN0IG1heWJlSGl0ID0gY2FjaGUgJiYgY2FjaGUuZ2V0KHRhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KSk7XG4gICAgICBpZiAobWF5YmVIaXQpIHtcbiAgICAgICAgcmV0dXJuIG1heWJlSGl0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBtYXliZUhpdCA9IGNhY2hlICYmIGNhY2hlLmdldChpbmZvLmJ1aWxkZXJOYW1lKTtcbiAgICAgIGlmIChtYXliZUhpdCkge1xuICAgICAgICByZXR1cm4gbWF5YmVIaXQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gX2NyZWF0ZUpvYkhhbmRsZXJGcm9tQnVpbGRlckluZm8oXG4gICAgICBpbmZvLFxuICAgICAgdGFyZ2V0LFxuICAgICAgdGhpcy5faG9zdCxcbiAgICAgIHRoaXMuX3JlZ2lzdHJ5LFxuICAgICAgb3B0aW9ucyB8fCB7fSxcbiAgICApO1xuXG4gICAgaWYgKGNhY2hlKSB7XG4gICAgICBpZiAodGFyZ2V0KSB7XG4gICAgICAgIGNhY2hlLnNldCh0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCksIHJlc3VsdC5waXBlKHNoYXJlUmVwbGF5KDEpKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjYWNoZS5zZXQoaW5mby5idWlsZGVyTmFtZSwgcmVzdWx0LnBpcGUoc2hhcmVSZXBsYXkoMSkpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZ2V0PEEgZXh0ZW5kcyBqc29uLkpzb25PYmplY3QsIEkgZXh0ZW5kcyBCdWlsZGVySW5wdXQsIE8gZXh0ZW5kcyBCdWlsZGVyT3V0cHV0PihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICk6IE9ic2VydmFibGU8Sm9iSGFuZGxlcjxBLCBJLCBPPiB8IG51bGw+IHtcbiAgICBjb25zdCBtID0gbmFtZS5tYXRjaCgvXihbXjpdKyk6KFteOl0rKSQvaSk7XG4gICAgaWYgKCFtKSB7XG4gICAgICByZXR1cm4gb2YobnVsbCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZyb20odGhpcy5fcmVzb2x2ZUJ1aWxkZXIobmFtZSkpLnBpcGUoXG4gICAgICBjb25jYXRNYXAoKGJ1aWxkZXJJbmZvKSA9PiAoYnVpbGRlckluZm8gPyB0aGlzLl9jcmVhdGVCdWlsZGVyKGJ1aWxkZXJJbmZvKSA6IG9mKG51bGwpKSksXG4gICAgICBmaXJzdChudWxsLCBudWxsKSxcbiAgICApIGFzIE9ic2VydmFibGU8Sm9iSGFuZGxlcjxBLCBJLCBPPiB8IG51bGw+O1xuICB9XG59XG5cbi8qKlxuICogQSBKb2JSZWdpc3RyeSB0aGF0IHJlc29sdmVzIHRhcmdldHMgZnJvbSB0aGUgaG9zdC5cbiAqL1xuY2xhc3MgQXJjaGl0ZWN0VGFyZ2V0Sm9iUmVnaXN0cnkgZXh0ZW5kcyBBcmNoaXRlY3RCdWlsZGVySm9iUmVnaXN0cnkge1xuICBvdmVycmlkZSBnZXQ8QSBleHRlbmRzIGpzb24uSnNvbk9iamVjdCwgSSBleHRlbmRzIEJ1aWxkZXJJbnB1dCwgTyBleHRlbmRzIEJ1aWxkZXJPdXRwdXQ+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgKTogT2JzZXJ2YWJsZTxKb2JIYW5kbGVyPEEsIEksIE8+IHwgbnVsbD4ge1xuICAgIGNvbnN0IG0gPSBuYW1lLm1hdGNoKC9eeyhbXjpdKyk6KFteOl0rKSg/OjooW146XSopKT99JC9pKTtcbiAgICBpZiAoIW0pIHtcbiAgICAgIHJldHVybiBvZihudWxsKTtcbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXQgPSB7XG4gICAgICBwcm9qZWN0OiBtWzFdLFxuICAgICAgdGFyZ2V0OiBtWzJdLFxuICAgICAgY29uZmlndXJhdGlvbjogbVszXSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIGZyb20oXG4gICAgICBQcm9taXNlLmFsbChbXG4gICAgICAgIHRoaXMuX2hvc3QuZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXQodGFyZ2V0KSxcbiAgICAgICAgdGhpcy5faG9zdC5nZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldCksXG4gICAgICBdKSxcbiAgICApLnBpcGUoXG4gICAgICBjb25jYXRNYXAoKFtidWlsZGVyU3RyLCBvcHRpb25zXSkgPT4ge1xuICAgICAgICBpZiAoYnVpbGRlclN0ciA9PT0gbnVsbCB8fCBvcHRpb25zID09PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIG9mKG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3Jlc29sdmVCdWlsZGVyKGJ1aWxkZXJTdHIpLnBpcGUoXG4gICAgICAgICAgY29uY2F0TWFwKChidWlsZGVySW5mbykgPT4ge1xuICAgICAgICAgICAgaWYgKGJ1aWxkZXJJbmZvID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvZihudWxsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NyZWF0ZUJ1aWxkZXIoYnVpbGRlckluZm8sIHRhcmdldCwgb3B0aW9ucyk7XG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG4gICAgICB9KSxcbiAgICAgIGZpcnN0KG51bGwsIG51bGwpLFxuICAgICkgYXMgT2JzZXJ2YWJsZTxKb2JIYW5kbGVyPEEsIEksIE8+IHwgbnVsbD47XG4gIH1cbn1cblxuZnVuY3Rpb24gX2dldFRhcmdldE9wdGlvbnNGYWN0b3J5KGhvc3Q6IEFyY2hpdGVjdEhvc3QpIHtcbiAgcmV0dXJuIGNyZWF0ZUpvYkhhbmRsZXI8VGFyZ2V0LCBqc29uLkpzb25WYWx1ZSwganNvbi5Kc29uT2JqZWN0PihcbiAgICAodGFyZ2V0KSA9PiB7XG4gICAgICByZXR1cm4gaG9zdC5nZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldCkudGhlbigob3B0aW9ucykgPT4ge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB0YXJnZXQ6ICR7SlNPTi5zdHJpbmdpZnkodGFyZ2V0KX0uYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3B0aW9ucztcbiAgICAgIH0pO1xuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJy4uZ2V0VGFyZ2V0T3B0aW9ucycsXG4gICAgICBvdXRwdXQ6IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgICAgIGFyZ3VtZW50OiBpbnB1dFNjaGVtYS5wcm9wZXJ0aWVzLnRhcmdldCxcbiAgICB9LFxuICApO1xufVxuXG5mdW5jdGlvbiBfZ2V0UHJvamVjdE1ldGFkYXRhRmFjdG9yeShob3N0OiBBcmNoaXRlY3RIb3N0KSB7XG4gIHJldHVybiBjcmVhdGVKb2JIYW5kbGVyPFRhcmdldCwganNvbi5Kc29uVmFsdWUsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgKHRhcmdldCkgPT4ge1xuICAgICAgcmV0dXJuIGhvc3QuZ2V0UHJvamVjdE1ldGFkYXRhKHRhcmdldCkudGhlbigob3B0aW9ucykgPT4ge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB0YXJnZXQ6ICR7SlNPTi5zdHJpbmdpZnkodGFyZ2V0KX0uYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3B0aW9ucztcbiAgICAgIH0pO1xuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJy4uZ2V0UHJvamVjdE1ldGFkYXRhJyxcbiAgICAgIG91dHB1dDogeyB0eXBlOiAnb2JqZWN0JyB9LFxuICAgICAgYXJndW1lbnQ6IHtcbiAgICAgICAgb25lT2Y6IFt7IHR5cGU6ICdzdHJpbmcnIH0sIGlucHV0U2NoZW1hLnByb3BlcnRpZXMudGFyZ2V0XSxcbiAgICAgIH0sXG4gICAgfSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gX2dldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0RmFjdG9yeShob3N0OiBBcmNoaXRlY3RIb3N0KSB7XG4gIHJldHVybiBjcmVhdGVKb2JIYW5kbGVyPFRhcmdldCwgbmV2ZXIsIHN0cmluZz4oXG4gICAgYXN5bmMgKHRhcmdldCkgPT4ge1xuICAgICAgY29uc3QgYnVpbGRlck5hbWUgPSBhd2FpdCBob3N0LmdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldCk7XG4gICAgICBpZiAoIWJ1aWxkZXJOYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gYnVpbGRlciB3ZXJlIGZvdW5kIGZvciB0YXJnZXQgJHt0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCl9LmApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYnVpbGRlck5hbWU7XG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiAnLi5nZXRCdWlsZGVyTmFtZUZvclRhcmdldCcsXG4gICAgICBvdXRwdXQ6IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgIGFyZ3VtZW50OiBpbnB1dFNjaGVtYS5wcm9wZXJ0aWVzLnRhcmdldCxcbiAgICB9LFxuICApO1xufVxuXG5mdW5jdGlvbiBfdmFsaWRhdGVPcHRpb25zRmFjdG9yeShob3N0OiBBcmNoaXRlY3RIb3N0LCByZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnkpIHtcbiAgcmV0dXJuIGNyZWF0ZUpvYkhhbmRsZXI8W3N0cmluZywganNvbi5Kc29uT2JqZWN0XSwgbmV2ZXIsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgYXN5bmMgKFtidWlsZGVyTmFtZSwgb3B0aW9uc10pID0+IHtcbiAgICAgIC8vIEdldCBvcHRpb24gc2NoZW1hIGZyb20gdGhlIGhvc3QuXG4gICAgICBjb25zdCBidWlsZGVySW5mbyA9IGF3YWl0IGhvc3QucmVzb2x2ZUJ1aWxkZXIoYnVpbGRlck5hbWUpO1xuICAgICAgaWYgKCFidWlsZGVySW5mbykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIGJ1aWxkZXIgaW5mbyB3ZXJlIGZvdW5kIGZvciBidWlsZGVyICR7SlNPTi5zdHJpbmdpZnkoYnVpbGRlck5hbWUpfS5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IGF3YWl0IHJlZ2lzdHJ5LmNvbXBpbGUoYnVpbGRlckluZm8ub3B0aW9uU2NoZW1hKTtcbiAgICAgIGNvbnN0IHsgZGF0YSwgc3VjY2VzcywgZXJyb3JzIH0gPSBhd2FpdCB2YWxpZGF0aW9uKG9wdGlvbnMpO1xuXG4gICAgICBpZiAoIXN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IGpzb24uc2NoZW1hLlNjaGVtYVZhbGlkYXRpb25FeGNlcHRpb24oZXJyb3JzKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGRhdGEgYXMganNvbi5Kc29uT2JqZWN0O1xuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJy4udmFsaWRhdGVPcHRpb25zJyxcbiAgICAgIG91dHB1dDogeyB0eXBlOiAnb2JqZWN0JyB9LFxuICAgICAgYXJndW1lbnQ6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgaXRlbXM6IFt7IHR5cGU6ICdzdHJpbmcnIH0sIHsgdHlwZTogJ29iamVjdCcgfV0sXG4gICAgICB9LFxuICAgIH0sXG4gICk7XG59XG5cbmV4cG9ydCBjbGFzcyBBcmNoaXRlY3Qge1xuICBwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZXI6IFNjaGVkdWxlcjtcbiAgcHJpdmF0ZSByZWFkb25seSBfam9iQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxCdWlsZGVySm9iSGFuZGxlcj4+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgX2luZm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnNlcnZhYmxlPEJ1aWxkZXJJbmZvPj4oKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIF9ob3N0OiBBcmNoaXRlY3RIb3N0LFxuICAgIHJlZ2lzdHJ5OiBqc29uLnNjaGVtYS5TY2hlbWFSZWdpc3RyeSA9IG5ldyBqc29uLnNjaGVtYS5Db3JlU2NoZW1hUmVnaXN0cnkoKSxcbiAgICBhZGRpdGlvbmFsSm9iUmVnaXN0cnk/OiBSZWdpc3RyeSxcbiAgKSB7XG4gICAgY29uc3QgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5ID0gbmV3IFNpbXBsZUpvYlJlZ2lzdHJ5KCk7XG4gICAgLy8gQ3JlYXRlIHByaXZhdGUgam9icy5cbiAgICBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnkucmVnaXN0ZXIoX2dldFRhcmdldE9wdGlvbnNGYWN0b3J5KF9ob3N0KSk7XG4gICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LnJlZ2lzdGVyKF9nZXRCdWlsZGVyTmFtZUZvclRhcmdldEZhY3RvcnkoX2hvc3QpKTtcbiAgICBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnkucmVnaXN0ZXIoX3ZhbGlkYXRlT3B0aW9uc0ZhY3RvcnkoX2hvc3QsIHJlZ2lzdHJ5KSk7XG4gICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LnJlZ2lzdGVyKF9nZXRQcm9qZWN0TWV0YWRhdGFGYWN0b3J5KF9ob3N0KSk7XG5cbiAgICBjb25zdCBqb2JSZWdpc3RyeSA9IG5ldyBGYWxsYmFja1JlZ2lzdHJ5KFtcbiAgICAgIG5ldyBBcmNoaXRlY3RUYXJnZXRKb2JSZWdpc3RyeShfaG9zdCwgcmVnaXN0cnksIHRoaXMuX2pvYkNhY2hlLCB0aGlzLl9pbmZvQ2FjaGUpLFxuICAgICAgbmV3IEFyY2hpdGVjdEJ1aWxkZXJKb2JSZWdpc3RyeShfaG9zdCwgcmVnaXN0cnksIHRoaXMuX2pvYkNhY2hlLCB0aGlzLl9pbmZvQ2FjaGUpLFxuICAgICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LFxuICAgICAgLi4uKGFkZGl0aW9uYWxKb2JSZWdpc3RyeSA/IFthZGRpdGlvbmFsSm9iUmVnaXN0cnldIDogW10pLFxuICAgIF0gYXMgUmVnaXN0cnlbXSk7XG5cbiAgICB0aGlzLl9zY2hlZHVsZXIgPSBuZXcgU2ltcGxlU2NoZWR1bGVyKGpvYlJlZ2lzdHJ5LCByZWdpc3RyeSk7XG4gIH1cblxuICBoYXMobmFtZTogSm9iTmFtZSkge1xuICAgIHJldHVybiB0aGlzLl9zY2hlZHVsZXIuaGFzKG5hbWUpO1xuICB9XG5cbiAgc2NoZWR1bGVCdWlsZGVyKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBvcHRpb25zOiBqc29uLkpzb25PYmplY3QsXG4gICAgc2NoZWR1bGVPcHRpb25zOiBTY2hlZHVsZU9wdGlvbnMgPSB7fSxcbiAgKTogUHJvbWlzZTxCdWlsZGVyUnVuPiB7XG4gICAgLy8gVGhlIGJlbG93IHdpbGwgbWF0Y2ggJ3Byb2plY3Q6dGFyZ2V0OmNvbmZpZ3VyYXRpb24nXG4gICAgaWYgKCEvXlteOl0rOlteOl0rKDpbXjpdKyk/JC8udGVzdChuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGJ1aWxkZXIgbmFtZTogJyArIEpTT04uc3RyaW5naWZ5KG5hbWUpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2NoZWR1bGVCeU5hbWUobmFtZSwgb3B0aW9ucywge1xuICAgICAgc2NoZWR1bGVyOiB0aGlzLl9zY2hlZHVsZXIsXG4gICAgICBsb2dnZXI6IHNjaGVkdWxlT3B0aW9ucy5sb2dnZXIgfHwgbmV3IGxvZ2dpbmcuTnVsbExvZ2dlcigpLFxuICAgICAgY3VycmVudERpcmVjdG9yeTogdGhpcy5faG9zdC5nZXRDdXJyZW50RGlyZWN0b3J5KCksXG4gICAgICB3b3Jrc3BhY2VSb290OiB0aGlzLl9ob3N0LmdldFdvcmtzcGFjZVJvb3QoKSxcbiAgICB9KTtcbiAgfVxuICBzY2hlZHVsZVRhcmdldChcbiAgICB0YXJnZXQ6IFRhcmdldCxcbiAgICBvdmVycmlkZXM6IGpzb24uSnNvbk9iamVjdCA9IHt9LFxuICAgIHNjaGVkdWxlT3B0aW9uczogU2NoZWR1bGVPcHRpb25zID0ge30sXG4gICk6IFByb21pc2U8QnVpbGRlclJ1bj4ge1xuICAgIHJldHVybiBzY2hlZHVsZUJ5VGFyZ2V0KHRhcmdldCwgb3ZlcnJpZGVzLCB7XG4gICAgICBzY2hlZHVsZXI6IHRoaXMuX3NjaGVkdWxlcixcbiAgICAgIGxvZ2dlcjogc2NoZWR1bGVPcHRpb25zLmxvZ2dlciB8fCBuZXcgbG9nZ2luZy5OdWxsTG9nZ2VyKCksXG4gICAgICBjdXJyZW50RGlyZWN0b3J5OiB0aGlzLl9ob3N0LmdldEN1cnJlbnREaXJlY3RvcnkoKSxcbiAgICAgIHdvcmtzcGFjZVJvb3Q6IHRoaXMuX2hvc3QuZ2V0V29ya3NwYWNlUm9vdCgpLFxuICAgIH0pO1xuICB9XG59XG4iXX0=