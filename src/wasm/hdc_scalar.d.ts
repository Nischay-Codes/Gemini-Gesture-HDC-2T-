/* tslint:disable */
/* eslint-disable */

/**
 * Scalar WebAssembly Engine for HDC-Zero.
 *
 * Implements 64-bit scalar operations for 10,000-bit BSC hypervectors,
 * serving as the baseline for WebAssembly SIMD comparisons.
 */
export class WasmScalarEngine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Microbenchmark: executes synthetic Hamming distance comparisons in a loop
     * to measure raw WASM throughput.
     */
    benchmark_hamming(iterations: number): any;
    /**
     * Classifies an unseen 15-frame trajectory using HDC associative memory.
     */
    classify(flat_trajectory: Float64Array): any;
    /**
     * Classifies an unseen 15-frame trajectory using the classical 1-NN Euclidean baseline.
     */
    classify_knn(flat_trajectory: Float64Array): any;
    /**
     * Clears all enrolled classes from memory.
     */
    clear(): void;
    /**
     * Deletes a specific enrolled class from memory.
     */
    delete_class(label: string): boolean;
    /**
     * Returns the engine execution architecture.
     */
    engine_name(): string;
    /**
     * Enrolls a one-shot demonstration trajectory for a class.
     * Expects 945 floats (15 frames of 21 landmarks with x, y, z).
     */
    enroll(label: string, flat_trajectory: Float64Array): number;
    /**
     * Retrieves all enrolled gesture labels.
     */
    get_enrolled_labels(): any;
    /**
     * Returns the fraction of set bits in the class prototype (should be ~0.50).
     */
    get_prototype_bit_density(label: string): number;
    /**
     * Retrieves the 1,250-byte representation of an enrolled class prototype for the Memory Inspector.
     */
    get_prototype_bytes(label: string): Uint8Array;
    /**
     * Indicates whether hardware SIMD128 intrinsics are active.
     */
    is_simd(): boolean;
    constructor();
    /**
     * Returns the number of currently enrolled gesture classes.
     */
    num_classes(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmscalarengine_free: (a: number, b: number) => void;
    readonly wasmscalarengine_benchmark_hamming: (a: number, b: number) => [number, number, number];
    readonly wasmscalarengine_classify: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmscalarengine_classify_knn: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmscalarengine_clear: (a: number) => void;
    readonly wasmscalarengine_delete_class: (a: number, b: number, c: number) => number;
    readonly wasmscalarengine_engine_name: (a: number) => [number, number];
    readonly wasmscalarengine_enroll: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmscalarengine_get_enrolled_labels: (a: number) => any;
    readonly wasmscalarengine_get_prototype_bit_density: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmscalarengine_get_prototype_bytes: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmscalarengine_is_simd: (a: number) => number;
    readonly wasmscalarengine_new: () => number;
    readonly wasmscalarengine_num_classes: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
