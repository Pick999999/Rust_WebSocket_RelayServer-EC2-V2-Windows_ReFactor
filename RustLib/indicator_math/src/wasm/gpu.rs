use js_sys::Float32Array;
use wasm_bindgen::prelude::*;
use wgpu::util::DeviceExt;

#[wasm_bindgen]
pub struct GpuAnalysisManager {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
}

#[wasm_bindgen]
impl GpuAnalysisManager {
    /// Asynchronous builder for GpuAnalysisManager
    pub async fn initialize() -> Result<GpuAnalysisManager, JsValue> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU | wgpu::Backends::GL,
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: None,
            })
            .await
            .ok_or_else(|| {
                JsValue::from_str(
                    "Failed to find appropriate adapter (WebGPU not supported by this browser?)",
                )
            })?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: None,
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::downlevel_webgl2_defaults()
                        .using_resolution(adapter.limits()),
                },
                None,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to request Device: {}", e)))?;

        let shader_src = include_str!("sma_shader.wgsl");
        let cs_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("SMA Shader"),
            source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(shader_src)),
        });

        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("SMA Compute Pipeline"),
            layout: None,
            module: &cs_module,
            entry_point: "main",
            compilation_options: Default::default(),
        });

        Ok(GpuAnalysisManager {
            device,
            queue,
            pipeline: compute_pipeline,
        })
    }

    /// Dispatch thousands of OHLC history computations straight to graphic cards!
    pub async fn dispatch_compute(&self, prices: Float32Array) -> Result<Float32Array, JsValue> {
        let prices_vec = prices.to_vec();
        let data_len = prices_vec.len();
        if data_len == 0 {
            return Ok(Float32Array::new_with_length(0));
        }

        let size = (data_len * std::mem::size_of::<f32>()) as wgpu::BufferAddress;

        let input_buffer = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Input Buffer"),
                contents: bytemuck::cast_slice(&prices_vec),
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            });

        let output_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Output Buffer"),
            size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        let staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Staging Buffer"),
            size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group_layout = self.pipeline.get_bind_group_layout(0);
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: input_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: output_buffer.as_entire_binding(),
                },
            ],
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });

        {
            let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: None,
                timestamp_writes: None,
            });
            cpass.set_pipeline(&self.pipeline);
            cpass.set_bind_group(0, &bind_group, &[]);
            let workgroups = ((data_len as f32) / 64.0).ceil() as u32;
            cpass.dispatch_workgroups(workgroups, 1, 1);
        }

        encoder.copy_buffer_to_buffer(&output_buffer, 0, &staging_buffer, 0, size);
        self.queue.submit(Some(encoder.finish()));

        let buffer_slice = staging_buffer.slice(..);
        let (sender, receiver) = futures_channel::oneshot::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |v| sender.send(v).unwrap());

        // JS target implicitly resolves this async map upon browser event loop turn
        receiver
            .await
            .map_err(|_| JsValue::from_str("Failed to receive read signal for staging buffer."))?
            .map_err(|e| JsValue::from_str(&format!("Mapping error: {}", e)))?;

        let data = buffer_slice.get_mapped_range();
        let result: &[f32] = bytemuck::cast_slice(&data);

        let output_array = Float32Array::new_with_length(data_len as u32);
        output_array.copy_from(result);

        drop(data);
        staging_buffer.unmap();

        Ok(output_array)
    }
}
