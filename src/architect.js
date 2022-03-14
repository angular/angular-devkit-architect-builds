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
        const inboundBusWithInputValidation = context.inboundBus.pipe((0, operators_1.concatMap)((message) => {
            if (message.kind === core_1.experimental.jobs.JobInboundMessageKind.Input) {
                const v = message.value;
                const options = {
                    ...baseOptions,
                    ...v.options,
                };
                // Validate v against the options schema.
                return registry.compile(info.optionSchema).pipe((0, operators_1.concatMap)((validation) => validation(options)), (0, operators_1.map)((validationResult) => {
                    const { data, success, errors } = validationResult;
                    if (success) {
                        return { ...v, options: data };
                    }
                    throw new core_1.json.schema.SchemaValidationException(errors);
                }), (0, operators_1.map)((value) => ({ ...message, value })));
            }
            else {
                return (0, rxjs_1.of)(message);
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
                if (output.kind === core_1.experimental.jobs.JobOutboundMessageKind.Output) {
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
    return core_1.experimental.jobs.createJobHandler((target) => {
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
    return core_1.experimental.jobs.createJobHandler((target) => {
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
    return core_1.experimental.jobs.createJobHandler(async (target) => {
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
    return core_1.experimental.jobs.createJobHandler(async ([builderName, options]) => {
        // Get option schema from the host.
        const builderInfo = await host.resolveBuilder(builderName);
        if (!builderInfo) {
            throw new Error(`No builder info were found for builder ${JSON.stringify(builderName)}.`);
        }
        return registry
            .compile(builderInfo.optionSchema)
            .pipe((0, operators_1.concatMap)((validation) => validation(options)), (0, operators_1.switchMap)(({ data, success, errors }) => {
            if (success) {
                return (0, rxjs_1.of)(data);
            }
            throw new core_1.json.schema.SchemaValidationException(errors);
        }))
            .toPromise();
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
        const privateArchitectJobRegistry = new core_1.experimental.jobs.SimpleJobRegistry();
        // Create private jobs.
        privateArchitectJobRegistry.register(_getTargetOptionsFactory(_host));
        privateArchitectJobRegistry.register(_getBuilderNameForTargetFactory(_host));
        privateArchitectJobRegistry.register(_validateOptionsFactory(_host, registry));
        privateArchitectJobRegistry.register(_getProjectMetadataFactory(_host));
        const jobRegistry = new core_1.experimental.jobs.FallbackRegistry([
            new ArchitectTargetJobRegistry(_host, registry, this._jobCache, this._infoCache),
            new ArchitectBuilderJobRegistry(_host, registry, this._jobCache, this._infoCache),
            privateArchitectJobRegistry,
            ...(additionalJobRegistry ? [additionalJobRegistry] : []),
        ]);
        this._scheduler = new core_1.experimental.jobs.SimpleScheduler(jobRegistry, registry);
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
            analytics: scheduleOptions.analytics,
        });
    }
    scheduleTarget(target, overrides = {}, scheduleOptions = {}) {
        return (0, schedule_by_name_1.scheduleByTarget)(target, overrides, {
            scheduler: this._scheduler,
            logger: scheduleOptions.logger || new core_1.logging.NullLogger(),
            currentDirectory: this._host.getCurrentDirectory(),
            workspaceRoot: this._host.getWorkspaceRoot(),
            analytics: scheduleOptions.analytics,
        });
    }
}
exports.Architect = Architect;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjaGl0ZWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L3NyYy9hcmNoaXRlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBRUgsK0NBQThFO0FBQzlFLCtCQUFzRTtBQUN0RSw4Q0FTd0I7QUFDeEIsK0JBUWU7QUFFZix5REFBc0U7QUFFdEUsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDbkQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFFckQsU0FBUyxnQ0FBZ0MsQ0FDdkMsSUFBaUIsRUFDakIsTUFBMEIsRUFDMUIsSUFBbUIsRUFDbkIsUUFBb0MsRUFDcEMsV0FBNEI7SUFFNUIsTUFBTSxjQUFjLEdBQXVCO1FBQ3pDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBQSw0QkFBc0IsRUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztRQUN2RSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBQzVCLEtBQUssRUFBRSxXQUFXO1FBQ2xCLE1BQU0sRUFBRSxZQUFZO1FBQ3BCLElBQUk7S0FDTCxDQUFDO0lBRUYsU0FBUyxPQUFPLENBQUMsUUFBeUIsRUFBRSxPQUE0QztRQUN0RiwyQ0FBMkM7UUFDM0MsTUFBTSw2QkFBNkIsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FDM0QsSUFBQSxxQkFBUyxFQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDcEIsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLG1CQUFZLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRTtnQkFDbEUsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLEtBQXFCLENBQUM7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QyxtQkFBbUIsRUFBRTtZQUNsRCxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtZQUM1QyxTQUFTLEVBQUUsZUFBZSxDQUFDLFNBQVM7U0FDckMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOURELDhCQThEQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBhbmFseXRpY3MsIGV4cGVyaW1lbnRhbCwganNvbiwgbG9nZ2luZyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IE9ic2VydmFibGUsIGZyb20sIG1lcmdlLCBvZiwgb25FcnJvclJlc3VtZU5leHQgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7XG4gIGNvbmNhdE1hcCxcbiAgZmlyc3QsXG4gIGlnbm9yZUVsZW1lbnRzLFxuICBsYXN0LFxuICBtYXAsXG4gIHNoYXJlUmVwbGF5LFxuICBzd2l0Y2hNYXAsXG4gIHRha2VVbnRpbCxcbn0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgQnVpbGRlckluZm8sXG4gIEJ1aWxkZXJJbnB1dCxcbiAgQnVpbGRlck91dHB1dCxcbiAgQnVpbGRlclJlZ2lzdHJ5LFxuICBCdWlsZGVyUnVuLFxuICBUYXJnZXQsXG4gIHRhcmdldFN0cmluZ0Zyb21UYXJnZXQsXG59IGZyb20gJy4vYXBpJztcbmltcG9ydCB7IEFyY2hpdGVjdEhvc3QsIEJ1aWxkZXJEZXNjcmlwdGlvbiwgQnVpbGRlckpvYkhhbmRsZXIgfSBmcm9tICcuL2ludGVybmFsJztcbmltcG9ydCB7IHNjaGVkdWxlQnlOYW1lLCBzY2hlZHVsZUJ5VGFyZ2V0IH0gZnJvbSAnLi9zY2hlZHVsZS1ieS1uYW1lJztcblxuY29uc3QgaW5wdXRTY2hlbWEgPSByZXF1aXJlKCcuL2lucHV0LXNjaGVtYS5qc29uJyk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSByZXF1aXJlKCcuL291dHB1dC1zY2hlbWEuanNvbicpO1xuXG5mdW5jdGlvbiBfY3JlYXRlSm9iSGFuZGxlckZyb21CdWlsZGVySW5mbyhcbiAgaW5mbzogQnVpbGRlckluZm8sXG4gIHRhcmdldDogVGFyZ2V0IHwgdW5kZWZpbmVkLFxuICBob3N0OiBBcmNoaXRlY3RIb3N0LFxuICByZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnksXG4gIGJhc2VPcHRpb25zOiBqc29uLkpzb25PYmplY3QsXG4pOiBPYnNlcnZhYmxlPEJ1aWxkZXJKb2JIYW5kbGVyPiB7XG4gIGNvbnN0IGpvYkRlc2NyaXB0aW9uOiBCdWlsZGVyRGVzY3JpcHRpb24gPSB7XG4gICAgbmFtZTogdGFyZ2V0ID8gYHske3RhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KX19YCA6IGluZm8uYnVpbGRlck5hbWUsXG4gICAgYXJndW1lbnQ6IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gICAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gICAgaW5mbyxcbiAgfTtcblxuICBmdW5jdGlvbiBoYW5kbGVyKGFyZ3VtZW50OiBqc29uLkpzb25PYmplY3QsIGNvbnRleHQ6IGV4cGVyaW1lbnRhbC5qb2JzLkpvYkhhbmRsZXJDb250ZXh0KSB7XG4gICAgLy8gQWRkIGlucHV0IHZhbGlkYXRpb24gdG8gdGhlIGluYm91bmQgYnVzLlxuICAgIGNvbnN0IGluYm91bmRCdXNXaXRoSW5wdXRWYWxpZGF0aW9uID0gY29udGV4dC5pbmJvdW5kQnVzLnBpcGUoXG4gICAgICBjb25jYXRNYXAoKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgaWYgKG1lc3NhZ2Uua2luZCA9PT0gZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLklucHV0KSB7XG4gICAgICAgICAgY29uc3QgdiA9IG1lc3NhZ2UudmFsdWUgYXMgQnVpbGRlcklucHV0O1xuICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAuLi5iYXNlT3B0aW9ucyxcbiAgICAgICAgICAgIC4uLnYub3B0aW9ucyxcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgdiBhZ2FpbnN0IHRoZSBvcHRpb25zIHNjaGVtYS5cbiAgICAgICAgICByZXR1cm4gcmVnaXN0cnkuY29tcGlsZShpbmZvLm9wdGlvblNjaGVtYSkucGlwZShcbiAgICAgICAgICAgIGNvbmNhdE1hcCgodmFsaWRhdGlvbikgPT4gdmFsaWRhdGlvbihvcHRpb25zKSksXG4gICAgICAgICAgICBtYXAoKHZhbGlkYXRpb25SZXN1bHQ6IGpzb24uc2NoZW1hLlNjaGVtYVZhbGlkYXRvclJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCB7IGRhdGEsIHN1Y2Nlc3MsIGVycm9ycyB9ID0gdmFsaWRhdGlvblJlc3VsdDtcbiAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAuLi52LCBvcHRpb25zOiBkYXRhIH0gYXMgQnVpbGRlcklucHV0O1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdGhyb3cgbmV3IGpzb24uc2NoZW1hLlNjaGVtYVZhbGlkYXRpb25FeGNlcHRpb24oZXJyb3JzKTtcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbWFwKCh2YWx1ZSkgPT4gKHsgLi4ubWVzc2FnZSwgdmFsdWUgfSkpLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG9mKG1lc3NhZ2UgYXMgZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2U8QnVpbGRlcklucHV0Pik7XG4gICAgICAgIH1cbiAgICAgIH0pLFxuICAgICAgLy8gVXNpbmcgYSBzaGFyZSByZXBsYXkgYmVjYXVzZSB0aGUgam9iIG1pZ2h0IGJlIHN5bmNocm9ub3VzbHkgc2VuZGluZyBpbnB1dCwgYnV0XG4gICAgICAvLyBhc3luY2hyb25vdXNseSBsaXN0ZW5pbmcgdG8gaXQuXG4gICAgICBzaGFyZVJlcGxheSgxKSxcbiAgICApO1xuXG4gICAgLy8gTWFrZSBhbiBpbmJvdW5kQnVzIHRoYXQgY29tcGxldGVzIGluc3RlYWQgb2YgZXJyb3Jpbmcgb3V0LlxuICAgIC8vIFdlJ2xsIG1lcmdlIHRoZSBlcnJvcnMgaW50byB0aGUgb3V0cHV0IGluc3RlYWQuXG4gICAgY29uc3QgaW5ib3VuZEJ1cyA9IG9uRXJyb3JSZXN1bWVOZXh0KGluYm91bmRCdXNXaXRoSW5wdXRWYWxpZGF0aW9uKTtcblxuICAgIGNvbnN0IG91dHB1dCA9IGZyb20oaG9zdC5sb2FkQnVpbGRlcihpbmZvKSkucGlwZShcbiAgICAgIGNvbmNhdE1hcCgoYnVpbGRlcikgPT4ge1xuICAgICAgICBpZiAoYnVpbGRlciA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGxvYWQgYnVpbGRlciBmb3IgYnVpbGRlckluZm8gJHtKU09OLnN0cmluZ2lmeShpbmZvLCBudWxsLCAyKX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBidWlsZGVyLmhhbmRsZXIoYXJndW1lbnQsIHsgLi4uY29udGV4dCwgaW5ib3VuZEJ1cyB9KS5waXBlKFxuICAgICAgICAgIG1hcCgob3V0cHV0KSA9PiB7XG4gICAgICAgICAgICBpZiAob3V0cHV0LmtpbmQgPT09IGV4cGVyaW1lbnRhbC5qb2JzLkpvYk91dGJvdW5kTWVzc2FnZUtpbmQuT3V0cHV0KSB7XG4gICAgICAgICAgICAgIC8vIEFkZCB0YXJnZXQgdG8gaXQuXG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ub3V0cHV0LFxuICAgICAgICAgICAgICAgIHZhbHVlOiB7XG4gICAgICAgICAgICAgICAgICAuLi5vdXRwdXQudmFsdWUsXG4gICAgICAgICAgICAgICAgICAuLi4odGFyZ2V0ID8geyB0YXJnZXQgfSA6IDApLFxuICAgICAgICAgICAgICAgIH0gYXMganNvbi5Kc29uT2JqZWN0LFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG91dHB1dDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgIH0pLFxuICAgICAgLy8gU2hhcmUgc3Vic2NyaXB0aW9ucyB0byB0aGUgb3V0cHV0LCBvdGhlcndpc2UgdGhlIHRoZSBoYW5kbGVyIHdpbGwgYmUgcmUtcnVuLlxuICAgICAgc2hhcmVSZXBsYXkoKSxcbiAgICApO1xuXG4gICAgLy8gU2VwYXJhdGUgdGhlIGVycm9ycyBmcm9tIHRoZSBpbmJvdW5kIGJ1cyBpbnRvIHRoZWlyIG93biBvYnNlcnZhYmxlIHRoYXQgY29tcGxldGVzIHdoZW4gdGhlXG4gICAgLy8gYnVpbGRlciBvdXRwdXQgZG9lcy5cbiAgICBjb25zdCBpbmJvdW5kQnVzRXJyb3JzID0gaW5ib3VuZEJ1c1dpdGhJbnB1dFZhbGlkYXRpb24ucGlwZShcbiAgICAgIGlnbm9yZUVsZW1lbnRzKCksXG4gICAgICB0YWtlVW50aWwob25FcnJvclJlc3VtZU5leHQob3V0cHV0LnBpcGUobGFzdCgpKSkpLFxuICAgICk7XG5cbiAgICAvLyBSZXR1cm4gdGhlIGJ1aWxkZXIgb3V0cHV0IHBsdXMgYW55IGlucHV0IGVycm9ycy5cbiAgICByZXR1cm4gbWVyZ2UoaW5ib3VuZEJ1c0Vycm9ycywgb3V0cHV0KTtcbiAgfVxuXG4gIHJldHVybiBvZihPYmplY3QuYXNzaWduKGhhbmRsZXIsIHsgam9iRGVzY3JpcHRpb24gfSkgYXMgQnVpbGRlckpvYkhhbmRsZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNjaGVkdWxlT3B0aW9ucyB7XG4gIGxvZ2dlcj86IGxvZ2dpbmcuTG9nZ2VyO1xuICBhbmFseXRpY3M/OiBhbmFseXRpY3MuQW5hbHl0aWNzO1xufVxuXG4vKipcbiAqIEEgSm9iUmVnaXN0cnkgdGhhdCByZXNvbHZlcyBidWlsZGVyIHRhcmdldHMgZnJvbSB0aGUgaG9zdC5cbiAqL1xuY2xhc3MgQXJjaGl0ZWN0QnVpbGRlckpvYlJlZ2lzdHJ5IGltcGxlbWVudHMgQnVpbGRlclJlZ2lzdHJ5IHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJvdGVjdGVkIF9ob3N0OiBBcmNoaXRlY3RIb3N0LFxuICAgIHByb3RlY3RlZCBfcmVnaXN0cnk6IGpzb24uc2NoZW1hLlNjaGVtYVJlZ2lzdHJ5LFxuICAgIHByb3RlY3RlZCBfam9iQ2FjaGU/OiBNYXA8c3RyaW5nLCBPYnNlcnZhYmxlPEJ1aWxkZXJKb2JIYW5kbGVyIHwgbnVsbD4+LFxuICAgIHByb3RlY3RlZCBfaW5mb0NhY2hlPzogTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxCdWlsZGVySW5mbyB8IG51bGw+PixcbiAgKSB7fVxuXG4gIHByb3RlY3RlZCBfcmVzb2x2ZUJ1aWxkZXIobmFtZTogc3RyaW5nKTogT2JzZXJ2YWJsZTxCdWlsZGVySW5mbyB8IG51bGw+IHtcbiAgICBjb25zdCBjYWNoZSA9IHRoaXMuX2luZm9DYWNoZTtcbiAgICBpZiAoY2FjaGUpIHtcbiAgICAgIGNvbnN0IG1heWJlQ2FjaGUgPSBjYWNoZS5nZXQobmFtZSk7XG4gICAgICBpZiAobWF5YmVDYWNoZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBtYXliZUNhY2hlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpbmZvID0gZnJvbSh0aGlzLl9ob3N0LnJlc29sdmVCdWlsZGVyKG5hbWUpKS5waXBlKHNoYXJlUmVwbGF5KDEpKTtcbiAgICAgIGNhY2hlLnNldChuYW1lLCBpbmZvKTtcblxuICAgICAgcmV0dXJuIGluZm87XG4gICAgfVxuXG4gICAgcmV0dXJuIGZyb20odGhpcy5faG9zdC5yZXNvbHZlQnVpbGRlcihuYW1lKSk7XG4gIH1cblxuICBwcm90ZWN0ZWQgX2NyZWF0ZUJ1aWxkZXIoXG4gICAgaW5mbzogQnVpbGRlckluZm8sXG4gICAgdGFyZ2V0PzogVGFyZ2V0LFxuICAgIG9wdGlvbnM/OiBqc29uLkpzb25PYmplY3QsXG4gICk6IE9ic2VydmFibGU8QnVpbGRlckpvYkhhbmRsZXIgfCBudWxsPiB7XG4gICAgY29uc3QgY2FjaGUgPSB0aGlzLl9qb2JDYWNoZTtcbiAgICBpZiAodGFyZ2V0KSB7XG4gICAgICBjb25zdCBtYXliZUhpdCA9IGNhY2hlICYmIGNhY2hlLmdldCh0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCkpO1xuICAgICAgaWYgKG1heWJlSGl0KSB7XG4gICAgICAgIHJldHVybiBtYXliZUhpdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbWF5YmVIaXQgPSBjYWNoZSAmJiBjYWNoZS5nZXQoaW5mby5idWlsZGVyTmFtZSk7XG4gICAgICBpZiAobWF5YmVIaXQpIHtcbiAgICAgICAgcmV0dXJuIG1heWJlSGl0O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IF9jcmVhdGVKb2JIYW5kbGVyRnJvbUJ1aWxkZXJJbmZvKFxuICAgICAgaW5mbyxcbiAgICAgIHRhcmdldCxcbiAgICAgIHRoaXMuX2hvc3QsXG4gICAgICB0aGlzLl9yZWdpc3RyeSxcbiAgICAgIG9wdGlvbnMgfHwge30sXG4gICAgKTtcblxuICAgIGlmIChjYWNoZSkge1xuICAgICAgaWYgKHRhcmdldCkge1xuICAgICAgICBjYWNoZS5zZXQodGFyZ2V0U3RyaW5nRnJvbVRhcmdldCh0YXJnZXQpLCByZXN1bHQucGlwZShzaGFyZVJlcGxheSgxKSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2FjaGUuc2V0KGluZm8uYnVpbGRlck5hbWUsIHJlc3VsdC5waXBlKHNoYXJlUmVwbGF5KDEpKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGdldDxBIGV4dGVuZHMganNvbi5Kc29uT2JqZWN0LCBJIGV4dGVuZHMgQnVpbGRlcklucHV0LCBPIGV4dGVuZHMgQnVpbGRlck91dHB1dD4oXG4gICAgbmFtZTogc3RyaW5nLFxuICApOiBPYnNlcnZhYmxlPGV4cGVyaW1lbnRhbC5qb2JzLkpvYkhhbmRsZXI8QSwgSSwgTz4gfCBudWxsPiB7XG4gICAgY29uc3QgbSA9IG5hbWUubWF0Y2goL14oW146XSspOihbXjpdKykkL2kpO1xuICAgIGlmICghbSkge1xuICAgICAgcmV0dXJuIG9mKG51bGwpO1xuICAgIH1cblxuICAgIHJldHVybiBmcm9tKHRoaXMuX3Jlc29sdmVCdWlsZGVyKG5hbWUpKS5waXBlKFxuICAgICAgY29uY2F0TWFwKChidWlsZGVySW5mbykgPT4gKGJ1aWxkZXJJbmZvID8gdGhpcy5fY3JlYXRlQnVpbGRlcihidWlsZGVySW5mbykgOiBvZihudWxsKSkpLFxuICAgICAgZmlyc3QobnVsbCwgbnVsbCksXG4gICAgKSBhcyBPYnNlcnZhYmxlPGV4cGVyaW1lbnRhbC5qb2JzLkpvYkhhbmRsZXI8QSwgSSwgTz4gfCBudWxsPjtcbiAgfVxufVxuXG4vKipcbiAqIEEgSm9iUmVnaXN0cnkgdGhhdCByZXNvbHZlcyB0YXJnZXRzIGZyb20gdGhlIGhvc3QuXG4gKi9cbmNsYXNzIEFyY2hpdGVjdFRhcmdldEpvYlJlZ2lzdHJ5IGV4dGVuZHMgQXJjaGl0ZWN0QnVpbGRlckpvYlJlZ2lzdHJ5IHtcbiAgb3ZlcnJpZGUgZ2V0PEEgZXh0ZW5kcyBqc29uLkpzb25PYmplY3QsIEkgZXh0ZW5kcyBCdWlsZGVySW5wdXQsIE8gZXh0ZW5kcyBCdWlsZGVyT3V0cHV0PihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICk6IE9ic2VydmFibGU8ZXhwZXJpbWVudGFsLmpvYnMuSm9iSGFuZGxlcjxBLCBJLCBPPiB8IG51bGw+IHtcbiAgICBjb25zdCBtID0gbmFtZS5tYXRjaCgvXnsoW146XSspOihbXjpdKykoPzo6KFteOl0qKSk/fSQvaSk7XG4gICAgaWYgKCFtKSB7XG4gICAgICByZXR1cm4gb2YobnVsbCk7XG4gICAgfVxuXG4gICAgY29uc3QgdGFyZ2V0ID0ge1xuICAgICAgcHJvamVjdDogbVsxXSxcbiAgICAgIHRhcmdldDogbVsyXSxcbiAgICAgIGNvbmZpZ3VyYXRpb246IG1bM10sXG4gICAgfTtcblxuICAgIHJldHVybiBmcm9tKFxuICAgICAgUHJvbWlzZS5hbGwoW1xuICAgICAgICB0aGlzLl9ob3N0LmdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldCksXG4gICAgICAgIHRoaXMuX2hvc3QuZ2V0T3B0aW9uc0ZvclRhcmdldCh0YXJnZXQpLFxuICAgICAgXSksXG4gICAgKS5waXBlKFxuICAgICAgY29uY2F0TWFwKChbYnVpbGRlclN0ciwgb3B0aW9uc10pID0+IHtcbiAgICAgICAgaWYgKGJ1aWxkZXJTdHIgPT09IG51bGwgfHwgb3B0aW9ucyA9PT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBvZihudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLl9yZXNvbHZlQnVpbGRlcihidWlsZGVyU3RyKS5waXBlKFxuICAgICAgICAgIGNvbmNhdE1hcCgoYnVpbGRlckluZm8pID0+IHtcbiAgICAgICAgICAgIGlmIChidWlsZGVySW5mbyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICByZXR1cm4gb2YobnVsbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jcmVhdGVCdWlsZGVyKGJ1aWxkZXJJbmZvLCB0YXJnZXQsIG9wdGlvbnMpO1xuICAgICAgICAgIH0pLFxuICAgICAgICApO1xuICAgICAgfSksXG4gICAgICBmaXJzdChudWxsLCBudWxsKSxcbiAgICApIGFzIE9ic2VydmFibGU8ZXhwZXJpbWVudGFsLmpvYnMuSm9iSGFuZGxlcjxBLCBJLCBPPiB8IG51bGw+O1xuICB9XG59XG5cbmZ1bmN0aW9uIF9nZXRUYXJnZXRPcHRpb25zRmFjdG9yeShob3N0OiBBcmNoaXRlY3RIb3N0KSB7XG4gIHJldHVybiBleHBlcmltZW50YWwuam9icy5jcmVhdGVKb2JIYW5kbGVyPFRhcmdldCwganNvbi5Kc29uVmFsdWUsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgKHRhcmdldCkgPT4ge1xuICAgICAgcmV0dXJuIGhvc3QuZ2V0T3B0aW9uc0ZvclRhcmdldCh0YXJnZXQpLnRoZW4oKG9wdGlvbnMpID0+IHtcbiAgICAgICAgaWYgKG9wdGlvbnMgPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgdGFyZ2V0OiAke0pTT04uc3RyaW5naWZ5KHRhcmdldCl9LmApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9wdGlvbnM7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIHtcbiAgICAgIG5hbWU6ICcuLmdldFRhcmdldE9wdGlvbnMnLFxuICAgICAgb3V0cHV0OiB7IHR5cGU6ICdvYmplY3QnIH0sXG4gICAgICBhcmd1bWVudDogaW5wdXRTY2hlbWEucHJvcGVydGllcy50YXJnZXQsXG4gICAgfSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gX2dldFByb2plY3RNZXRhZGF0YUZhY3RvcnkoaG9zdDogQXJjaGl0ZWN0SG9zdCkge1xuICByZXR1cm4gZXhwZXJpbWVudGFsLmpvYnMuY3JlYXRlSm9iSGFuZGxlcjxUYXJnZXQsIGpzb24uSnNvblZhbHVlLCBqc29uLkpzb25PYmplY3Q+KFxuICAgICh0YXJnZXQpID0+IHtcbiAgICAgIHJldHVybiBob3N0LmdldFByb2plY3RNZXRhZGF0YSh0YXJnZXQpLnRoZW4oKG9wdGlvbnMpID0+IHtcbiAgICAgICAgaWYgKG9wdGlvbnMgPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgdGFyZ2V0OiAke0pTT04uc3RyaW5naWZ5KHRhcmdldCl9LmApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9wdGlvbnM7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIHtcbiAgICAgIG5hbWU6ICcuLmdldFByb2plY3RNZXRhZGF0YScsXG4gICAgICBvdXRwdXQ6IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgICAgIGFyZ3VtZW50OiB7XG4gICAgICAgIG9uZU9mOiBbeyB0eXBlOiAnc3RyaW5nJyB9LCBpbnB1dFNjaGVtYS5wcm9wZXJ0aWVzLnRhcmdldF0sXG4gICAgICB9LFxuICAgIH0sXG4gICk7XG59XG5cbmZ1bmN0aW9uIF9nZXRCdWlsZGVyTmFtZUZvclRhcmdldEZhY3RvcnkoaG9zdDogQXJjaGl0ZWN0SG9zdCkge1xuICByZXR1cm4gZXhwZXJpbWVudGFsLmpvYnMuY3JlYXRlSm9iSGFuZGxlcjxUYXJnZXQsIG5ldmVyLCBzdHJpbmc+KFxuICAgIGFzeW5jICh0YXJnZXQpID0+IHtcbiAgICAgIGNvbnN0IGJ1aWxkZXJOYW1lID0gYXdhaXQgaG9zdC5nZXRCdWlsZGVyTmFtZUZvclRhcmdldCh0YXJnZXQpO1xuICAgICAgaWYgKCFidWlsZGVyTmFtZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIGJ1aWxkZXIgd2VyZSBmb3VuZCBmb3IgdGFyZ2V0ICR7dGFyZ2V0U3RyaW5nRnJvbVRhcmdldCh0YXJnZXQpfS5gKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGJ1aWxkZXJOYW1lO1xuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJy4uZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXQnLFxuICAgICAgb3V0cHV0OiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICBhcmd1bWVudDogaW5wdXRTY2hlbWEucHJvcGVydGllcy50YXJnZXQsXG4gICAgfSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gX3ZhbGlkYXRlT3B0aW9uc0ZhY3RvcnkoaG9zdDogQXJjaGl0ZWN0SG9zdCwgcmVnaXN0cnk6IGpzb24uc2NoZW1hLlNjaGVtYVJlZ2lzdHJ5KSB7XG4gIHJldHVybiBleHBlcmltZW50YWwuam9icy5jcmVhdGVKb2JIYW5kbGVyPFtzdHJpbmcsIGpzb24uSnNvbk9iamVjdF0sIG5ldmVyLCBqc29uLkpzb25PYmplY3Q+KFxuICAgIGFzeW5jIChbYnVpbGRlck5hbWUsIG9wdGlvbnNdKSA9PiB7XG4gICAgICAvLyBHZXQgb3B0aW9uIHNjaGVtYSBmcm9tIHRoZSBob3N0LlxuICAgICAgY29uc3QgYnVpbGRlckluZm8gPSBhd2FpdCBob3N0LnJlc29sdmVCdWlsZGVyKGJ1aWxkZXJOYW1lKTtcbiAgICAgIGlmICghYnVpbGRlckluZm8pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBidWlsZGVyIGluZm8gd2VyZSBmb3VuZCBmb3IgYnVpbGRlciAke0pTT04uc3RyaW5naWZ5KGJ1aWxkZXJOYW1lKX0uYCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdpc3RyeVxuICAgICAgICAuY29tcGlsZShidWlsZGVySW5mby5vcHRpb25TY2hlbWEpXG4gICAgICAgIC5waXBlKFxuICAgICAgICAgIGNvbmNhdE1hcCgodmFsaWRhdGlvbikgPT4gdmFsaWRhdGlvbihvcHRpb25zKSksXG4gICAgICAgICAgc3dpdGNoTWFwKCh7IGRhdGEsIHN1Y2Nlc3MsIGVycm9ycyB9KSA9PiB7XG4gICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICByZXR1cm4gb2YoZGF0YSBhcyBqc29uLkpzb25PYmplY3QpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aHJvdyBuZXcganNvbi5zY2hlbWEuU2NoZW1hVmFsaWRhdGlvbkV4Y2VwdGlvbihlcnJvcnMpO1xuICAgICAgICAgIH0pLFxuICAgICAgICApXG4gICAgICAgIC50b1Byb21pc2UoKTtcbiAgICB9LFxuICAgIHtcbiAgICAgIG5hbWU6ICcuLnZhbGlkYXRlT3B0aW9ucycsXG4gICAgICBvdXRwdXQ6IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgICAgIGFyZ3VtZW50OiB7XG4gICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgIGl0ZW1zOiBbeyB0eXBlOiAnc3RyaW5nJyB9LCB7IHR5cGU6ICdvYmplY3QnIH1dLFxuICAgICAgfSxcbiAgICB9LFxuICApO1xufVxuXG5leHBvcnQgY2xhc3MgQXJjaGl0ZWN0IHtcbiAgcHJpdmF0ZSByZWFkb25seSBfc2NoZWR1bGVyOiBleHBlcmltZW50YWwuam9icy5TY2hlZHVsZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgX2pvYkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic2VydmFibGU8QnVpbGRlckpvYkhhbmRsZXI+PigpO1xuICBwcml2YXRlIHJlYWRvbmx5IF9pbmZvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxCdWlsZGVySW5mbz4+KCk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBfaG9zdDogQXJjaGl0ZWN0SG9zdCxcbiAgICByZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnkgPSBuZXcganNvbi5zY2hlbWEuQ29yZVNjaGVtYVJlZ2lzdHJ5KCksXG4gICAgYWRkaXRpb25hbEpvYlJlZ2lzdHJ5PzogZXhwZXJpbWVudGFsLmpvYnMuUmVnaXN0cnksXG4gICkge1xuICAgIGNvbnN0IHByaXZhdGVBcmNoaXRlY3RKb2JSZWdpc3RyeSA9IG5ldyBleHBlcmltZW50YWwuam9icy5TaW1wbGVKb2JSZWdpc3RyeSgpO1xuICAgIC8vIENyZWF0ZSBwcml2YXRlIGpvYnMuXG4gICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LnJlZ2lzdGVyKF9nZXRUYXJnZXRPcHRpb25zRmFjdG9yeShfaG9zdCkpO1xuICAgIHByaXZhdGVBcmNoaXRlY3RKb2JSZWdpc3RyeS5yZWdpc3RlcihfZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXRGYWN0b3J5KF9ob3N0KSk7XG4gICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LnJlZ2lzdGVyKF92YWxpZGF0ZU9wdGlvbnNGYWN0b3J5KF9ob3N0LCByZWdpc3RyeSkpO1xuICAgIHByaXZhdGVBcmNoaXRlY3RKb2JSZWdpc3RyeS5yZWdpc3RlcihfZ2V0UHJvamVjdE1ldGFkYXRhRmFjdG9yeShfaG9zdCkpO1xuXG4gICAgY29uc3Qgam9iUmVnaXN0cnkgPSBuZXcgZXhwZXJpbWVudGFsLmpvYnMuRmFsbGJhY2tSZWdpc3RyeShbXG4gICAgICBuZXcgQXJjaGl0ZWN0VGFyZ2V0Sm9iUmVnaXN0cnkoX2hvc3QsIHJlZ2lzdHJ5LCB0aGlzLl9qb2JDYWNoZSwgdGhpcy5faW5mb0NhY2hlKSxcbiAgICAgIG5ldyBBcmNoaXRlY3RCdWlsZGVySm9iUmVnaXN0cnkoX2hvc3QsIHJlZ2lzdHJ5LCB0aGlzLl9qb2JDYWNoZSwgdGhpcy5faW5mb0NhY2hlKSxcbiAgICAgIHByaXZhdGVBcmNoaXRlY3RKb2JSZWdpc3RyeSxcbiAgICAgIC4uLihhZGRpdGlvbmFsSm9iUmVnaXN0cnkgPyBbYWRkaXRpb25hbEpvYlJlZ2lzdHJ5XSA6IFtdKSxcbiAgICBdIGFzIGV4cGVyaW1lbnRhbC5qb2JzLlJlZ2lzdHJ5W10pO1xuXG4gICAgdGhpcy5fc2NoZWR1bGVyID0gbmV3IGV4cGVyaW1lbnRhbC5qb2JzLlNpbXBsZVNjaGVkdWxlcihqb2JSZWdpc3RyeSwgcmVnaXN0cnkpO1xuICB9XG5cbiAgaGFzKG5hbWU6IGV4cGVyaW1lbnRhbC5qb2JzLkpvYk5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZWR1bGVyLmhhcyhuYW1lKTtcbiAgfVxuXG4gIHNjaGVkdWxlQnVpbGRlcihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgb3B0aW9uczoganNvbi5Kc29uT2JqZWN0LFxuICAgIHNjaGVkdWxlT3B0aW9uczogU2NoZWR1bGVPcHRpb25zID0ge30sXG4gICk6IFByb21pc2U8QnVpbGRlclJ1bj4ge1xuICAgIC8vIFRoZSBiZWxvdyB3aWxsIG1hdGNoICdwcm9qZWN0OnRhcmdldDpjb25maWd1cmF0aW9uJ1xuICAgIGlmICghL15bXjpdKzpbXjpdKyg6W146XSspPyQvLnRlc3QobmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBidWlsZGVyIG5hbWU6ICcgKyBKU09OLnN0cmluZ2lmeShuYW1lKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNjaGVkdWxlQnlOYW1lKG5hbWUsIG9wdGlvbnMsIHtcbiAgICAgIHNjaGVkdWxlcjogdGhpcy5fc2NoZWR1bGVyLFxuICAgICAgbG9nZ2VyOiBzY2hlZHVsZU9wdGlvbnMubG9nZ2VyIHx8IG5ldyBsb2dnaW5nLk51bGxMb2dnZXIoKSxcbiAgICAgIGN1cnJlbnREaXJlY3Rvcnk6IHRoaXMuX2hvc3QuZ2V0Q3VycmVudERpcmVjdG9yeSgpLFxuICAgICAgd29ya3NwYWNlUm9vdDogdGhpcy5faG9zdC5nZXRXb3Jrc3BhY2VSb290KCksXG4gICAgICBhbmFseXRpY3M6IHNjaGVkdWxlT3B0aW9ucy5hbmFseXRpY3MsXG4gICAgfSk7XG4gIH1cbiAgc2NoZWR1bGVUYXJnZXQoXG4gICAgdGFyZ2V0OiBUYXJnZXQsXG4gICAgb3ZlcnJpZGVzOiBqc29uLkpzb25PYmplY3QgPSB7fSxcbiAgICBzY2hlZHVsZU9wdGlvbnM6IFNjaGVkdWxlT3B0aW9ucyA9IHt9LFxuICApOiBQcm9taXNlPEJ1aWxkZXJSdW4+IHtcbiAgICByZXR1cm4gc2NoZWR1bGVCeVRhcmdldCh0YXJnZXQsIG92ZXJyaWRlcywge1xuICAgICAgc2NoZWR1bGVyOiB0aGlzLl9zY2hlZHVsZXIsXG4gICAgICBsb2dnZXI6IHNjaGVkdWxlT3B0aW9ucy5sb2dnZXIgfHwgbmV3IGxvZ2dpbmcuTnVsbExvZ2dlcigpLFxuICAgICAgY3VycmVudERpcmVjdG9yeTogdGhpcy5faG9zdC5nZXRDdXJyZW50RGlyZWN0b3J5KCksXG4gICAgICB3b3Jrc3BhY2VSb290OiB0aGlzLl9ob3N0LmdldFdvcmtzcGFjZVJvb3QoKSxcbiAgICAgIGFuYWx5dGljczogc2NoZWR1bGVPcHRpb25zLmFuYWx5dGljcyxcbiAgICB9KTtcbiAgfVxufVxuIl19