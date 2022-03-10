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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjaGl0ZWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYXJjaGl0ZWN0L3NyYy9hcmNoaXRlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBRUgsK0NBQThFO0FBQzlFLCtCQUFzRTtBQUN0RSw4Q0FTd0I7QUFDeEIsK0JBUWU7QUFFZix5REFBc0U7QUFFdEUsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDbkQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFFckQsU0FBUyxnQ0FBZ0MsQ0FDdkMsSUFBaUIsRUFDakIsTUFBMEIsRUFDMUIsSUFBbUIsRUFDbkIsUUFBb0MsRUFDcEMsV0FBNEI7SUFFNUIsTUFBTSxjQUFjLEdBQXVCO1FBQ3pDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBQSw0QkFBc0IsRUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVztRQUN2RSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBQzVCLEtBQUssRUFBRSxXQUFXO1FBQ2xCLE1BQU0sRUFBRSxZQUFZO1FBQ3BCLElBQUk7S0FDTCxDQUFDO0lBRUYsU0FBUyxPQUFPLENBQUMsUUFBeUIsRUFBRSxPQUE0QztRQUN0RiwyQ0FBMkM7UUFDM0MsTUFBTSw2QkFBNkIsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FDM0QsSUFBQSxxQkFBUyxFQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDcEIsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLG1CQUFZLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRTtnQkFDbEUsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLEtBQXFCLENBQUM7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QyxtQkFBbUIsRUFBRTtZQUNsRCxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtZQUM1QyxTQUFTLEVBQUUsZUFBZSxDQUFDLFNBQVM7U0FDckMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOURELDhCQThEQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBhbmFseXRpY3MsIGV4cGVyaW1lbnRhbCwganNvbiwgbG9nZ2luZyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IE9ic2VydmFibGUsIGZyb20sIG1lcmdlLCBvZiwgb25FcnJvclJlc3VtZU5leHQgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7XG4gIGNvbmNhdE1hcCxcbiAgZmlyc3QsXG4gIGlnbm9yZUVsZW1lbnRzLFxuICBsYXN0LFxuICBtYXAsXG4gIHNoYXJlUmVwbGF5LFxuICBzd2l0Y2hNYXAsXG4gIHRha2VVbnRpbCxcbn0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgQnVpbGRlckluZm8sXG4gIEJ1aWxkZXJJbnB1dCxcbiAgQnVpbGRlck91dHB1dCxcbiAgQnVpbGRlclJlZ2lzdHJ5LFxuICBCdWlsZGVyUnVuLFxuICBUYXJnZXQsXG4gIHRhcmdldFN0cmluZ0Zyb21UYXJnZXQsXG59IGZyb20gJy4vYXBpJztcbmltcG9ydCB7IEFyY2hpdGVjdEhvc3QsIEJ1aWxkZXJEZXNjcmlwdGlvbiwgQnVpbGRlckpvYkhhbmRsZXIgfSBmcm9tICcuL2ludGVybmFsJztcbmltcG9ydCB7IHNjaGVkdWxlQnlOYW1lLCBzY2hlZHVsZUJ5VGFyZ2V0IH0gZnJvbSAnLi9zY2hlZHVsZS1ieS1uYW1lJztcblxuY29uc3QgaW5wdXRTY2hlbWEgPSByZXF1aXJlKCcuL2lucHV0LXNjaGVtYS5qc29uJyk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSByZXF1aXJlKCcuL291dHB1dC1zY2hlbWEuanNvbicpO1xuXG5mdW5jdGlvbiBfY3JlYXRlSm9iSGFuZGxlckZyb21CdWlsZGVySW5mbyhcbiAgaW5mbzogQnVpbGRlckluZm8sXG4gIHRhcmdldDogVGFyZ2V0IHwgdW5kZWZpbmVkLFxuICBob3N0OiBBcmNoaXRlY3RIb3N0LFxuICByZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnksXG4gIGJhc2VPcHRpb25zOiBqc29uLkpzb25PYmplY3QsXG4pOiBPYnNlcnZhYmxlPEJ1aWxkZXJKb2JIYW5kbGVyPiB7XG4gIGNvbnN0IGpvYkRlc2NyaXB0aW9uOiBCdWlsZGVyRGVzY3JpcHRpb24gPSB7XG4gICAgbmFtZTogdGFyZ2V0ID8gYHske3RhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KX19YCA6IGluZm8uYnVpbGRlck5hbWUsXG4gICAgYXJndW1lbnQ6IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gICAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gICAgaW5mbyxcbiAgfTtcblxuICBmdW5jdGlvbiBoYW5kbGVyKGFyZ3VtZW50OiBqc29uLkpzb25PYmplY3QsIGNvbnRleHQ6IGV4cGVyaW1lbnRhbC5qb2JzLkpvYkhhbmRsZXJDb250ZXh0KSB7XG4gICAgLy8gQWRkIGlucHV0IHZhbGlkYXRpb24gdG8gdGhlIGluYm91bmQgYnVzLlxuICAgIGNvbnN0IGluYm91bmRCdXNXaXRoSW5wdXRWYWxpZGF0aW9uID0gY29udGV4dC5pbmJvdW5kQnVzLnBpcGUoXG4gICAgICBjb25jYXRNYXAoKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgaWYgKG1lc3NhZ2Uua2luZCA9PT0gZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2VLaW5kLklucHV0KSB7XG4gICAgICAgICAgY29uc3QgdiA9IG1lc3NhZ2UudmFsdWUgYXMgQnVpbGRlcklucHV0O1xuICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAuLi5iYXNlT3B0aW9ucyxcbiAgICAgICAgICAgIC4uLnYub3B0aW9ucyxcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgdiBhZ2FpbnN0IHRoZSBvcHRpb25zIHNjaGVtYS5cbiAgICAgICAgICByZXR1cm4gcmVnaXN0cnkuY29tcGlsZShpbmZvLm9wdGlvblNjaGVtYSkucGlwZShcbiAgICAgICAgICAgIGNvbmNhdE1hcCgodmFsaWRhdGlvbikgPT4gdmFsaWRhdGlvbihvcHRpb25zKSksXG4gICAgICAgICAgICBtYXAoKHZhbGlkYXRpb25SZXN1bHQ6IGpzb24uc2NoZW1hLlNjaGVtYVZhbGlkYXRvclJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCB7IGRhdGEsIHN1Y2Nlc3MsIGVycm9ycyB9ID0gdmFsaWRhdGlvblJlc3VsdDtcbiAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAuLi52LCBvcHRpb25zOiBkYXRhIH0gYXMgQnVpbGRlcklucHV0O1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdGhyb3cgbmV3IGpzb24uc2NoZW1hLlNjaGVtYVZhbGlkYXRpb25FeGNlcHRpb24oZXJyb3JzKTtcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbWFwKCh2YWx1ZSkgPT4gKHsgLi4ubWVzc2FnZSwgdmFsdWUgfSkpLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG9mKG1lc3NhZ2UgYXMgZXhwZXJpbWVudGFsLmpvYnMuSm9iSW5ib3VuZE1lc3NhZ2U8QnVpbGRlcklucHV0Pik7XG4gICAgICAgIH1cbiAgICAgIH0pLFxuICAgICAgLy8gVXNpbmcgYSBzaGFyZSByZXBsYXkgYmVjYXVzZSB0aGUgam9iIG1pZ2h0IGJlIHN5bmNocm9ub3VzbHkgc2VuZGluZyBpbnB1dCwgYnV0XG4gICAgICAvLyBhc3luY2hyb25vdXNseSBsaXN0ZW5pbmcgdG8gaXQuXG4gICAgICBzaGFyZVJlcGxheSgxKSxcbiAgICApO1xuXG4gICAgLy8gTWFrZSBhbiBpbmJvdW5kQnVzIHRoYXQgY29tcGxldGVzIGluc3RlYWQgb2YgZXJyb3Jpbmcgb3V0LlxuICAgIC8vIFdlJ2xsIG1lcmdlIHRoZSBlcnJvcnMgaW50byB0aGUgb3V0cHV0IGluc3RlYWQuXG4gICAgY29uc3QgaW5ib3VuZEJ1cyA9IG9uRXJyb3JSZXN1bWVOZXh0KGluYm91bmRCdXNXaXRoSW5wdXRWYWxpZGF0aW9uKTtcblxuICAgIGNvbnN0IG91dHB1dCA9IGZyb20oaG9zdC5sb2FkQnVpbGRlcihpbmZvKSkucGlwZShcbiAgICAgIGNvbmNhdE1hcCgoYnVpbGRlcikgPT4ge1xuICAgICAgICBpZiAoYnVpbGRlciA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGxvYWQgYnVpbGRlciBmb3IgYnVpbGRlckluZm8gJHtKU09OLnN0cmluZ2lmeShpbmZvLCBudWxsLCAyKX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBidWlsZGVyLmhhbmRsZXIoYXJndW1lbnQsIHsgLi4uY29udGV4dCwgaW5ib3VuZEJ1cyB9KS5waXBlKFxuICAgICAgICAgIG1hcCgob3V0cHV0KSA9PiB7XG4gICAgICAgICAgICBpZiAob3V0cHV0LmtpbmQgPT09IGV4cGVyaW1lbnRhbC5qb2JzLkpvYk91dGJvdW5kTWVzc2FnZUtpbmQuT3V0cHV0KSB7XG4gICAgICAgICAgICAgIC8vIEFkZCB0YXJnZXQgdG8gaXQuXG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ub3V0cHV0LFxuICAgICAgICAgICAgICAgIHZhbHVlOiB7XG4gICAgICAgICAgICAgICAgICAuLi5vdXRwdXQudmFsdWUsXG4gICAgICAgICAgICAgICAgICAuLi4odGFyZ2V0ID8geyB0YXJnZXQgfSA6IDApLFxuICAgICAgICAgICAgICAgIH0gYXMgdW5rbm93biBhcyBqc29uLkpzb25PYmplY3QsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gb3V0cHV0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgICApO1xuICAgICAgfSksXG4gICAgICAvLyBTaGFyZSBzdWJzY3JpcHRpb25zIHRvIHRoZSBvdXRwdXQsIG90aGVyd2lzZSB0aGUgdGhlIGhhbmRsZXIgd2lsbCBiZSByZS1ydW4uXG4gICAgICBzaGFyZVJlcGxheSgpLFxuICAgICk7XG5cbiAgICAvLyBTZXBhcmF0ZSB0aGUgZXJyb3JzIGZyb20gdGhlIGluYm91bmQgYnVzIGludG8gdGhlaXIgb3duIG9ic2VydmFibGUgdGhhdCBjb21wbGV0ZXMgd2hlbiB0aGVcbiAgICAvLyBidWlsZGVyIG91dHB1dCBkb2VzLlxuICAgIGNvbnN0IGluYm91bmRCdXNFcnJvcnMgPSBpbmJvdW5kQnVzV2l0aElucHV0VmFsaWRhdGlvbi5waXBlKFxuICAgICAgaWdub3JlRWxlbWVudHMoKSxcbiAgICAgIHRha2VVbnRpbChvbkVycm9yUmVzdW1lTmV4dChvdXRwdXQucGlwZShsYXN0KCkpKSksXG4gICAgKTtcblxuICAgIC8vIFJldHVybiB0aGUgYnVpbGRlciBvdXRwdXQgcGx1cyBhbnkgaW5wdXQgZXJyb3JzLlxuICAgIHJldHVybiBtZXJnZShpbmJvdW5kQnVzRXJyb3JzLCBvdXRwdXQpO1xuICB9XG5cbiAgcmV0dXJuIG9mKE9iamVjdC5hc3NpZ24oaGFuZGxlciwgeyBqb2JEZXNjcmlwdGlvbiB9KSBhcyBCdWlsZGVySm9iSGFuZGxlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NoZWR1bGVPcHRpb25zIHtcbiAgbG9nZ2VyPzogbG9nZ2luZy5Mb2dnZXI7XG4gIGFuYWx5dGljcz86IGFuYWx5dGljcy5BbmFseXRpY3M7XG59XG5cbi8qKlxuICogQSBKb2JSZWdpc3RyeSB0aGF0IHJlc29sdmVzIGJ1aWxkZXIgdGFyZ2V0cyBmcm9tIHRoZSBob3N0LlxuICovXG5jbGFzcyBBcmNoaXRlY3RCdWlsZGVySm9iUmVnaXN0cnkgaW1wbGVtZW50cyBCdWlsZGVyUmVnaXN0cnkge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcm90ZWN0ZWQgX2hvc3Q6IEFyY2hpdGVjdEhvc3QsXG4gICAgcHJvdGVjdGVkIF9yZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnksXG4gICAgcHJvdGVjdGVkIF9qb2JDYWNoZT86IE1hcDxzdHJpbmcsIE9ic2VydmFibGU8QnVpbGRlckpvYkhhbmRsZXIgfCBudWxsPj4sXG4gICAgcHJvdGVjdGVkIF9pbmZvQ2FjaGU/OiBNYXA8c3RyaW5nLCBPYnNlcnZhYmxlPEJ1aWxkZXJJbmZvIHwgbnVsbD4+LFxuICApIHt9XG5cbiAgcHJvdGVjdGVkIF9yZXNvbHZlQnVpbGRlcihuYW1lOiBzdHJpbmcpOiBPYnNlcnZhYmxlPEJ1aWxkZXJJbmZvIHwgbnVsbD4ge1xuICAgIGNvbnN0IGNhY2hlID0gdGhpcy5faW5mb0NhY2hlO1xuICAgIGlmIChjYWNoZSkge1xuICAgICAgY29uc3QgbWF5YmVDYWNoZSA9IGNhY2hlLmdldChuYW1lKTtcbiAgICAgIGlmIChtYXliZUNhY2hlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG1heWJlQ2FjaGU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGluZm8gPSBmcm9tKHRoaXMuX2hvc3QucmVzb2x2ZUJ1aWxkZXIobmFtZSkpLnBpcGUoc2hhcmVSZXBsYXkoMSkpO1xuICAgICAgY2FjaGUuc2V0KG5hbWUsIGluZm8pO1xuXG4gICAgICByZXR1cm4gaW5mbztcbiAgICB9XG5cbiAgICByZXR1cm4gZnJvbSh0aGlzLl9ob3N0LnJlc29sdmVCdWlsZGVyKG5hbWUpKTtcbiAgfVxuXG4gIHByb3RlY3RlZCBfY3JlYXRlQnVpbGRlcihcbiAgICBpbmZvOiBCdWlsZGVySW5mbyxcbiAgICB0YXJnZXQ/OiBUYXJnZXQsXG4gICAgb3B0aW9ucz86IGpzb24uSnNvbk9iamVjdCxcbiAgKTogT2JzZXJ2YWJsZTxCdWlsZGVySm9iSGFuZGxlciB8IG51bGw+IHtcbiAgICBjb25zdCBjYWNoZSA9IHRoaXMuX2pvYkNhY2hlO1xuICAgIGlmICh0YXJnZXQpIHtcbiAgICAgIGNvbnN0IG1heWJlSGl0ID0gY2FjaGUgJiYgY2FjaGUuZ2V0KHRhcmdldFN0cmluZ0Zyb21UYXJnZXQodGFyZ2V0KSk7XG4gICAgICBpZiAobWF5YmVIaXQpIHtcbiAgICAgICAgcmV0dXJuIG1heWJlSGl0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBtYXliZUhpdCA9IGNhY2hlICYmIGNhY2hlLmdldChpbmZvLmJ1aWxkZXJOYW1lKTtcbiAgICAgIGlmIChtYXliZUhpdCkge1xuICAgICAgICByZXR1cm4gbWF5YmVIaXQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gX2NyZWF0ZUpvYkhhbmRsZXJGcm9tQnVpbGRlckluZm8oXG4gICAgICBpbmZvLFxuICAgICAgdGFyZ2V0LFxuICAgICAgdGhpcy5faG9zdCxcbiAgICAgIHRoaXMuX3JlZ2lzdHJ5LFxuICAgICAgb3B0aW9ucyB8fCB7fSxcbiAgICApO1xuXG4gICAgaWYgKGNhY2hlKSB7XG4gICAgICBpZiAodGFyZ2V0KSB7XG4gICAgICAgIGNhY2hlLnNldCh0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCksIHJlc3VsdC5waXBlKHNoYXJlUmVwbGF5KDEpKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjYWNoZS5zZXQoaW5mby5idWlsZGVyTmFtZSwgcmVzdWx0LnBpcGUoc2hhcmVSZXBsYXkoMSkpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZ2V0PEEgZXh0ZW5kcyBqc29uLkpzb25PYmplY3QsIEkgZXh0ZW5kcyBCdWlsZGVySW5wdXQsIE8gZXh0ZW5kcyBCdWlsZGVyT3V0cHV0PihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICk6IE9ic2VydmFibGU8ZXhwZXJpbWVudGFsLmpvYnMuSm9iSGFuZGxlcjxBLCBJLCBPPiB8IG51bGw+IHtcbiAgICBjb25zdCBtID0gbmFtZS5tYXRjaCgvXihbXjpdKyk6KFteOl0rKSQvaSk7XG4gICAgaWYgKCFtKSB7XG4gICAgICByZXR1cm4gb2YobnVsbCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZyb20odGhpcy5fcmVzb2x2ZUJ1aWxkZXIobmFtZSkpLnBpcGUoXG4gICAgICBjb25jYXRNYXAoKGJ1aWxkZXJJbmZvKSA9PiAoYnVpbGRlckluZm8gPyB0aGlzLl9jcmVhdGVCdWlsZGVyKGJ1aWxkZXJJbmZvKSA6IG9mKG51bGwpKSksXG4gICAgICBmaXJzdChudWxsLCBudWxsKSxcbiAgICApIGFzIE9ic2VydmFibGU8ZXhwZXJpbWVudGFsLmpvYnMuSm9iSGFuZGxlcjxBLCBJLCBPPiB8IG51bGw+O1xuICB9XG59XG5cbi8qKlxuICogQSBKb2JSZWdpc3RyeSB0aGF0IHJlc29sdmVzIHRhcmdldHMgZnJvbSB0aGUgaG9zdC5cbiAqL1xuY2xhc3MgQXJjaGl0ZWN0VGFyZ2V0Sm9iUmVnaXN0cnkgZXh0ZW5kcyBBcmNoaXRlY3RCdWlsZGVySm9iUmVnaXN0cnkge1xuICBvdmVycmlkZSBnZXQ8QSBleHRlbmRzIGpzb24uSnNvbk9iamVjdCwgSSBleHRlbmRzIEJ1aWxkZXJJbnB1dCwgTyBleHRlbmRzIEJ1aWxkZXJPdXRwdXQ+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgKTogT2JzZXJ2YWJsZTxleHBlcmltZW50YWwuam9icy5Kb2JIYW5kbGVyPEEsIEksIE8+IHwgbnVsbD4ge1xuICAgIGNvbnN0IG0gPSBuYW1lLm1hdGNoKC9eeyhbXjpdKyk6KFteOl0rKSg/OjooW146XSopKT99JC9pKTtcbiAgICBpZiAoIW0pIHtcbiAgICAgIHJldHVybiBvZihudWxsKTtcbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXQgPSB7XG4gICAgICBwcm9qZWN0OiBtWzFdLFxuICAgICAgdGFyZ2V0OiBtWzJdLFxuICAgICAgY29uZmlndXJhdGlvbjogbVszXSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIGZyb20oXG4gICAgICBQcm9taXNlLmFsbChbXG4gICAgICAgIHRoaXMuX2hvc3QuZ2V0QnVpbGRlck5hbWVGb3JUYXJnZXQodGFyZ2V0KSxcbiAgICAgICAgdGhpcy5faG9zdC5nZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldCksXG4gICAgICBdKSxcbiAgICApLnBpcGUoXG4gICAgICBjb25jYXRNYXAoKFtidWlsZGVyU3RyLCBvcHRpb25zXSkgPT4ge1xuICAgICAgICBpZiAoYnVpbGRlclN0ciA9PT0gbnVsbCB8fCBvcHRpb25zID09PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIG9mKG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3Jlc29sdmVCdWlsZGVyKGJ1aWxkZXJTdHIpLnBpcGUoXG4gICAgICAgICAgY29uY2F0TWFwKChidWlsZGVySW5mbykgPT4ge1xuICAgICAgICAgICAgaWYgKGJ1aWxkZXJJbmZvID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvZihudWxsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NyZWF0ZUJ1aWxkZXIoYnVpbGRlckluZm8sIHRhcmdldCwgb3B0aW9ucyk7XG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG4gICAgICB9KSxcbiAgICAgIGZpcnN0KG51bGwsIG51bGwpLFxuICAgICkgYXMgT2JzZXJ2YWJsZTxleHBlcmltZW50YWwuam9icy5Kb2JIYW5kbGVyPEEsIEksIE8+IHwgbnVsbD47XG4gIH1cbn1cblxuZnVuY3Rpb24gX2dldFRhcmdldE9wdGlvbnNGYWN0b3J5KGhvc3Q6IEFyY2hpdGVjdEhvc3QpIHtcbiAgcmV0dXJuIGV4cGVyaW1lbnRhbC5qb2JzLmNyZWF0ZUpvYkhhbmRsZXI8VGFyZ2V0LCBqc29uLkpzb25WYWx1ZSwganNvbi5Kc29uT2JqZWN0PihcbiAgICAodGFyZ2V0KSA9PiB7XG4gICAgICByZXR1cm4gaG9zdC5nZXRPcHRpb25zRm9yVGFyZ2V0KHRhcmdldCkudGhlbigob3B0aW9ucykgPT4ge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB0YXJnZXQ6ICR7SlNPTi5zdHJpbmdpZnkodGFyZ2V0KX0uYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3B0aW9ucztcbiAgICAgIH0pO1xuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJy4uZ2V0VGFyZ2V0T3B0aW9ucycsXG4gICAgICBvdXRwdXQ6IHsgdHlwZTogJ29iamVjdCcgfSxcbiAgICAgIGFyZ3VtZW50OiBpbnB1dFNjaGVtYS5wcm9wZXJ0aWVzLnRhcmdldCxcbiAgICB9LFxuICApO1xufVxuXG5mdW5jdGlvbiBfZ2V0UHJvamVjdE1ldGFkYXRhRmFjdG9yeShob3N0OiBBcmNoaXRlY3RIb3N0KSB7XG4gIHJldHVybiBleHBlcmltZW50YWwuam9icy5jcmVhdGVKb2JIYW5kbGVyPFRhcmdldCwganNvbi5Kc29uVmFsdWUsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgKHRhcmdldCkgPT4ge1xuICAgICAgcmV0dXJuIGhvc3QuZ2V0UHJvamVjdE1ldGFkYXRhKHRhcmdldCkudGhlbigob3B0aW9ucykgPT4ge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB0YXJnZXQ6ICR7SlNPTi5zdHJpbmdpZnkodGFyZ2V0KX0uYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3B0aW9ucztcbiAgICAgIH0pO1xuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJy4uZ2V0UHJvamVjdE1ldGFkYXRhJyxcbiAgICAgIG91dHB1dDogeyB0eXBlOiAnb2JqZWN0JyB9LFxuICAgICAgYXJndW1lbnQ6IHtcbiAgICAgICAgb25lT2Y6IFt7IHR5cGU6ICdzdHJpbmcnIH0sIGlucHV0U2NoZW1hLnByb3BlcnRpZXMudGFyZ2V0XSxcbiAgICAgIH0sXG4gICAgfSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gX2dldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0RmFjdG9yeShob3N0OiBBcmNoaXRlY3RIb3N0KSB7XG4gIHJldHVybiBleHBlcmltZW50YWwuam9icy5jcmVhdGVKb2JIYW5kbGVyPFRhcmdldCwgbmV2ZXIsIHN0cmluZz4oXG4gICAgYXN5bmMgKHRhcmdldCkgPT4ge1xuICAgICAgY29uc3QgYnVpbGRlck5hbWUgPSBhd2FpdCBob3N0LmdldEJ1aWxkZXJOYW1lRm9yVGFyZ2V0KHRhcmdldCk7XG4gICAgICBpZiAoIWJ1aWxkZXJOYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gYnVpbGRlciB3ZXJlIGZvdW5kIGZvciB0YXJnZXQgJHt0YXJnZXRTdHJpbmdGcm9tVGFyZ2V0KHRhcmdldCl9LmApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYnVpbGRlck5hbWU7XG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiAnLi5nZXRCdWlsZGVyTmFtZUZvclRhcmdldCcsXG4gICAgICBvdXRwdXQ6IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgIGFyZ3VtZW50OiBpbnB1dFNjaGVtYS5wcm9wZXJ0aWVzLnRhcmdldCxcbiAgICB9LFxuICApO1xufVxuXG5mdW5jdGlvbiBfdmFsaWRhdGVPcHRpb25zRmFjdG9yeShob3N0OiBBcmNoaXRlY3RIb3N0LCByZWdpc3RyeToganNvbi5zY2hlbWEuU2NoZW1hUmVnaXN0cnkpIHtcbiAgcmV0dXJuIGV4cGVyaW1lbnRhbC5qb2JzLmNyZWF0ZUpvYkhhbmRsZXI8W3N0cmluZywganNvbi5Kc29uT2JqZWN0XSwgbmV2ZXIsIGpzb24uSnNvbk9iamVjdD4oXG4gICAgYXN5bmMgKFtidWlsZGVyTmFtZSwgb3B0aW9uc10pID0+IHtcbiAgICAgIC8vIEdldCBvcHRpb24gc2NoZW1hIGZyb20gdGhlIGhvc3QuXG4gICAgICBjb25zdCBidWlsZGVySW5mbyA9IGF3YWl0IGhvc3QucmVzb2x2ZUJ1aWxkZXIoYnVpbGRlck5hbWUpO1xuICAgICAgaWYgKCFidWlsZGVySW5mbykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIGJ1aWxkZXIgaW5mbyB3ZXJlIGZvdW5kIGZvciBidWlsZGVyICR7SlNPTi5zdHJpbmdpZnkoYnVpbGRlck5hbWUpfS5gKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2lzdHJ5XG4gICAgICAgIC5jb21waWxlKGJ1aWxkZXJJbmZvLm9wdGlvblNjaGVtYSlcbiAgICAgICAgLnBpcGUoXG4gICAgICAgICAgY29uY2F0TWFwKCh2YWxpZGF0aW9uKSA9PiB2YWxpZGF0aW9uKG9wdGlvbnMpKSxcbiAgICAgICAgICBzd2l0Y2hNYXAoKHsgZGF0YSwgc3VjY2VzcywgZXJyb3JzIH0pID0+IHtcbiAgICAgICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvZihkYXRhIGFzIGpzb24uSnNvbk9iamVjdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRocm93IG5ldyBqc29uLnNjaGVtYS5TY2hlbWFWYWxpZGF0aW9uRXhjZXB0aW9uKGVycm9ycyk7XG4gICAgICAgICAgfSksXG4gICAgICAgIClcbiAgICAgICAgLnRvUHJvbWlzZSgpO1xuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJy4udmFsaWRhdGVPcHRpb25zJyxcbiAgICAgIG91dHB1dDogeyB0eXBlOiAnb2JqZWN0JyB9LFxuICAgICAgYXJndW1lbnQ6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgaXRlbXM6IFt7IHR5cGU6ICdzdHJpbmcnIH0sIHsgdHlwZTogJ29iamVjdCcgfV0sXG4gICAgICB9LFxuICAgIH0sXG4gICk7XG59XG5cbmV4cG9ydCBjbGFzcyBBcmNoaXRlY3Qge1xuICBwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZXI6IGV4cGVyaW1lbnRhbC5qb2JzLlNjaGVkdWxlcjtcbiAgcHJpdmF0ZSByZWFkb25seSBfam9iQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxCdWlsZGVySm9iSGFuZGxlcj4+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgX2luZm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnNlcnZhYmxlPEJ1aWxkZXJJbmZvPj4oKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIF9ob3N0OiBBcmNoaXRlY3RIb3N0LFxuICAgIHJlZ2lzdHJ5OiBqc29uLnNjaGVtYS5TY2hlbWFSZWdpc3RyeSA9IG5ldyBqc29uLnNjaGVtYS5Db3JlU2NoZW1hUmVnaXN0cnkoKSxcbiAgICBhZGRpdGlvbmFsSm9iUmVnaXN0cnk/OiBleHBlcmltZW50YWwuam9icy5SZWdpc3RyeSxcbiAgKSB7XG4gICAgY29uc3QgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5ID0gbmV3IGV4cGVyaW1lbnRhbC5qb2JzLlNpbXBsZUpvYlJlZ2lzdHJ5KCk7XG4gICAgLy8gQ3JlYXRlIHByaXZhdGUgam9icy5cbiAgICBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnkucmVnaXN0ZXIoX2dldFRhcmdldE9wdGlvbnNGYWN0b3J5KF9ob3N0KSk7XG4gICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LnJlZ2lzdGVyKF9nZXRCdWlsZGVyTmFtZUZvclRhcmdldEZhY3RvcnkoX2hvc3QpKTtcbiAgICBwcml2YXRlQXJjaGl0ZWN0Sm9iUmVnaXN0cnkucmVnaXN0ZXIoX3ZhbGlkYXRlT3B0aW9uc0ZhY3RvcnkoX2hvc3QsIHJlZ2lzdHJ5KSk7XG4gICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LnJlZ2lzdGVyKF9nZXRQcm9qZWN0TWV0YWRhdGFGYWN0b3J5KF9ob3N0KSk7XG5cbiAgICBjb25zdCBqb2JSZWdpc3RyeSA9IG5ldyBleHBlcmltZW50YWwuam9icy5GYWxsYmFja1JlZ2lzdHJ5KFtcbiAgICAgIG5ldyBBcmNoaXRlY3RUYXJnZXRKb2JSZWdpc3RyeShfaG9zdCwgcmVnaXN0cnksIHRoaXMuX2pvYkNhY2hlLCB0aGlzLl9pbmZvQ2FjaGUpLFxuICAgICAgbmV3IEFyY2hpdGVjdEJ1aWxkZXJKb2JSZWdpc3RyeShfaG9zdCwgcmVnaXN0cnksIHRoaXMuX2pvYkNhY2hlLCB0aGlzLl9pbmZvQ2FjaGUpLFxuICAgICAgcHJpdmF0ZUFyY2hpdGVjdEpvYlJlZ2lzdHJ5LFxuICAgICAgLi4uKGFkZGl0aW9uYWxKb2JSZWdpc3RyeSA/IFthZGRpdGlvbmFsSm9iUmVnaXN0cnldIDogW10pLFxuICAgIF0gYXMgZXhwZXJpbWVudGFsLmpvYnMuUmVnaXN0cnlbXSk7XG5cbiAgICB0aGlzLl9zY2hlZHVsZXIgPSBuZXcgZXhwZXJpbWVudGFsLmpvYnMuU2ltcGxlU2NoZWR1bGVyKGpvYlJlZ2lzdHJ5LCByZWdpc3RyeSk7XG4gIH1cblxuICBoYXMobmFtZTogZXhwZXJpbWVudGFsLmpvYnMuSm9iTmFtZSkge1xuICAgIHJldHVybiB0aGlzLl9zY2hlZHVsZXIuaGFzKG5hbWUpO1xuICB9XG5cbiAgc2NoZWR1bGVCdWlsZGVyKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBvcHRpb25zOiBqc29uLkpzb25PYmplY3QsXG4gICAgc2NoZWR1bGVPcHRpb25zOiBTY2hlZHVsZU9wdGlvbnMgPSB7fSxcbiAgKTogUHJvbWlzZTxCdWlsZGVyUnVuPiB7XG4gICAgLy8gVGhlIGJlbG93IHdpbGwgbWF0Y2ggJ3Byb2plY3Q6dGFyZ2V0OmNvbmZpZ3VyYXRpb24nXG4gICAgaWYgKCEvXlteOl0rOlteOl0rKDpbXjpdKyk/JC8udGVzdChuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGJ1aWxkZXIgbmFtZTogJyArIEpTT04uc3RyaW5naWZ5KG5hbWUpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2NoZWR1bGVCeU5hbWUobmFtZSwgb3B0aW9ucywge1xuICAgICAgc2NoZWR1bGVyOiB0aGlzLl9zY2hlZHVsZXIsXG4gICAgICBsb2dnZXI6IHNjaGVkdWxlT3B0aW9ucy5sb2dnZXIgfHwgbmV3IGxvZ2dpbmcuTnVsbExvZ2dlcigpLFxuICAgICAgY3VycmVudERpcmVjdG9yeTogdGhpcy5faG9zdC5nZXRDdXJyZW50RGlyZWN0b3J5KCksXG4gICAgICB3b3Jrc3BhY2VSb290OiB0aGlzLl9ob3N0LmdldFdvcmtzcGFjZVJvb3QoKSxcbiAgICAgIGFuYWx5dGljczogc2NoZWR1bGVPcHRpb25zLmFuYWx5dGljcyxcbiAgICB9KTtcbiAgfVxuICBzY2hlZHVsZVRhcmdldChcbiAgICB0YXJnZXQ6IFRhcmdldCxcbiAgICBvdmVycmlkZXM6IGpzb24uSnNvbk9iamVjdCA9IHt9LFxuICAgIHNjaGVkdWxlT3B0aW9uczogU2NoZWR1bGVPcHRpb25zID0ge30sXG4gICk6IFByb21pc2U8QnVpbGRlclJ1bj4ge1xuICAgIHJldHVybiBzY2hlZHVsZUJ5VGFyZ2V0KHRhcmdldCwgb3ZlcnJpZGVzLCB7XG4gICAgICBzY2hlZHVsZXI6IHRoaXMuX3NjaGVkdWxlcixcbiAgICAgIGxvZ2dlcjogc2NoZWR1bGVPcHRpb25zLmxvZ2dlciB8fCBuZXcgbG9nZ2luZy5OdWxsTG9nZ2VyKCksXG4gICAgICBjdXJyZW50RGlyZWN0b3J5OiB0aGlzLl9ob3N0LmdldEN1cnJlbnREaXJlY3RvcnkoKSxcbiAgICAgIHdvcmtzcGFjZVJvb3Q6IHRoaXMuX2hvc3QuZ2V0V29ya3NwYWNlUm9vdCgpLFxuICAgICAgYW5hbHl0aWNzOiBzY2hlZHVsZU9wdGlvbnMuYW5hbHl0aWNzLFxuICAgIH0pO1xuICB9XG59XG4iXX0=