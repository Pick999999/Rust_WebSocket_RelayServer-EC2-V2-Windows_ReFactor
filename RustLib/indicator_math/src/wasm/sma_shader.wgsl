@group(0) @binding(0) var<storage, read> inputs: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputs: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let limit = arrayLength(&inputs);
    
    if (i < limit) {
        let period: u32 = 20u;
        var sum: f32 = 0.0;
        
        let start_idx = i + 1u;
        
        if (start_idx >= period) {
            for (var j: u32 = start_idx - period; j < start_idx; j = j + 1u) {
                sum = sum + inputs[j];
            }
            outputs[i] = sum / f32(period);
        } else {
            // Not enough data for SMA, just output same price or 0
            outputs[i] = 0.0;
        }
    }
}
