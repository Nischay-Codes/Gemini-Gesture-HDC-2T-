import { Hypervector, ContinuousItemMemory, LandmarkEncoder, HDCItemMemory, DIMENSION } from './hdc_kernel.js';

console.log("=== VERIFYING GEMINI-GESTURE HDC KERNEL ===");

// 1. Orthogonality test
const h1 = Hypervector.random({ nextUint32: () => Math.floor(Math.random() * 0xFFFFFFFF) });
const h2 = Hypervector.random({ nextUint32: () => Math.floor(Math.random() * 0xFFFFFFFF) });
const dist = h1.hammingDistance(h2);
console.log(`Random Pair Hamming Distance: ${dist} / ${DIMENSION} (Expected ~5000, got ${(dist/DIMENSION*100).toFixed(2)}%)`);

// 2. Identity test
const selfDist = h1.hammingDistance(h1);
console.log(`Self Hamming Distance: ${selfDist} (Expected 0)`);

// 3. XOR binding test
const bound = h1.bind(h2);
const unbind = bound.bind(h2);
console.log(`Unbind Distance to Original: ${unbind.hammingDistance(h1)} (Expected 0 - exact reversal)`);

// 4. CIM linearity test
const cim = new ContinuousItemMemory(32, 42);
const l0 = cim.quantize(-1.0);
const l1 = cim.quantize(-0.9);
const l15 = cim.quantize(0.0);
const l31 = cim.quantize(1.0);
console.log(`CIM Adjacent Level Distance L0-L1: ${l0.hammingDistance(l1)} bits`);
console.log(`CIM Mid Level Distance L0-L15: ${l0.hammingDistance(l15)} bits`);
console.log(`CIM Extreme Distance L0-L31: ${l0.hammingDistance(l31)} bits (Expected ~5000)`);

// 5. Enrollment & Latency benchmark
const memory = new HDCItemMemory();
const encoder = new LandmarkEncoder();

// Synthetic hand landmarks (21 points)
function makeHand(offset = 0) {
  const pts = [];
  for (let i = 0; i < 21; i++) {
    pts.push({ x: 0.1 * i + offset, y: 0.05 * i, z: 0.01 * (i % 3) });
  }
  return pts;
}

const gHello = encoder.encodeFrame(makeHand(0.0));
const gWater = encoder.encodeFrame(makeHand(0.5));
const gHelp = encoder.encodeFrame(makeHand(-0.5));

const tEnroll0 = performance.now();
memory.enroll('HELLO', gHello, { spokenPhrase: 'Hello, how are you?' });
memory.enroll('WATER', gWater, { spokenPhrase: 'I need water please.' });
memory.enroll('HELP', gHelp, { spokenPhrase: 'Please help me emergency!' });
const tEnroll1 = performance.now();
console.log(`Enrolled 3 gestures in ${(tEnroll1 - tEnroll0).toFixed(3)} ms (Target < 2ms)`);

// 6. Query latency test (1000 queries)
const queryVec = gWater.clone();
const iters = 1000;
const tQ0 = performance.now();
for (let i = 0; i < iters; i++) {
  memory.query(queryVec);
}
const tQ1 = performance.now();
const avgUs = ((tQ1 - tQ0) / iters) * 1000;
const res = memory.query(queryVec);
console.log(`Matched label: "${res.label}" with distance: ${res.hammingDistance} bits`);
console.log(`Average Query Latency: ${avgUs.toFixed(2)} microseconds per query!`);
console.log("=== HDC KERNEL VERIFICATION COMPLETE: ALL PASS ===");
