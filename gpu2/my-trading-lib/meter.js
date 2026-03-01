class ChoppyMeter {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);

        // Safety check for canvas
        if (!this.canvas) {
            console.warn('ChoppyMeter: Canvas not found:', canvasId);
            this.ctx = null;
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.value = 0;
        this.targetValue = 0;
        this.options = {
            min: 0,
            max: 100,
            zones: [
                { from: 0, to: 38.2, color: '#22c55e' }, // Trending (Green)
                { from: 38.2, to: 61.8, color: '#eab308' }, // Neutral (Yellow)
                { from: 61.8, to: 100, color: '#ef4444' } // Choppy (Red)
            ],
            mainColor: '#3b82f6',
            textColor: '#f8fafc',
            ...options
        };

        // Handle High DPI
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.animating = false;
        this.render();
    }

    resize() {
        if (!this.canvas || !this.canvas.parentNode) return;

        const rect = this.canvas.parentNode.getBoundingClientRect();

        // Ensure minimum dimensions
        const width = Math.max(rect.width, 50);
        const height = Math.max(rect.height, 30);

        this.canvas.width = width * 2; // Retina
        this.canvas.height = height * 2;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.scale(2, 2);
        this.width = width;
        this.height = height;
        this.render();
    }

    setValue(val) {
        if (!this.ctx) return; // Safety check
        this.targetValue = Math.max(this.options.min, Math.min(this.options.max, val));
        if (!this.animating) {
            this.animate();
        }
    }

    animate() {
        if (!this.ctx) return; // Safety check
        this.animating = true;
        const diff = this.targetValue - this.value;

        if (Math.abs(diff) < 0.1) {
            this.value = this.targetValue;
            this.render();
            this.animating = false;
            return;
        }

        this.value += diff * 0.1; // Smooth easing
        this.render();
        requestAnimationFrame(() => this.animate());
    }

    render() {
        if (!this.ctx || !this.width || !this.height) return; // Safety check

        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height - 10; // Bottom centered
        const radius = Math.max(Math.min(cx, this.height) - 20, 10); // Ensure minimum radius of 10

        ctx.clearRect(0, 0, this.width, this.height);

        // Draw Background Arc (180 to 360/0)
        // Canvas angles: 0 is right, PI is left.
        // We want semi-circle from PI (180) to 2*PI (360/0)

        const startAngle = Math.PI;
        const endAngle = 2 * Math.PI;

        ctx.lineWidth = 15;
        ctx.lineCap = 'round';

        // Draw Zones
        this.options.zones.forEach(zone => {
            const zStart = startAngle + (zone.from / 100) * Math.PI;
            const zEnd = startAngle + (zone.to / 100) * Math.PI;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, zStart, zEnd);
            ctx.strokeStyle = zone.color;
            ctx.stroke();
        });

        // Current Value Angle
        // Value 0 => PI
        // Value 100 => 2PI
        const angle = startAngle + (this.value / 100) * Math.PI;

        // Needle
        const needleLen = radius - 10;
        const nx = cx + needleLen * Math.cos(angle);
        const ny = cy + needleLen * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = this.options.textColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Pivot Point
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
        ctx.fillStyle = this.options.textColor;
        ctx.fill();

        // Text Value
        ctx.fillStyle = this.options.textColor;
        ctx.font = 'bold 24px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this.value.toFixed(2), cx, cy - 30);

        ctx.font = '12px Outfit, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('CHOP INDEX', cx, cy - 10);
    }
}
