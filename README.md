# Virtual Tripwire

Virtual Tripwire is a safe learning simulation for region-of-interest motion detection. It demonstrates zones and event feedback without presenting itself as a real security monitor.

## What this demonstrates

- Defining a rectangular region of interest
- Comparing signal changes inside a zone
- Logging local events with timestamps
- Keeping alert language educational and non-operational

## Run it

Open `index.html` in a modern browser. For camera mode, serve the folder from localhost or HTTPS and choose **Start camera**. No npm, bundler, or build step is required.

## Browser and privacy notes

Camera permission is requested only after a user action, video-only constraints are used, frames are processed locally, and tracks stop on page exit. Pointer and sample modes remain available when permission is denied or tracking is unavailable. This is an educational visual lab, not a medical, security, or measurement-grade product.

## How to study this

Start with `index.html`, then inspect the `signalNow()`, `draw()`, and mode-specific renderer in `app.js`. Change one mapping at a time and keep the fallback understandable before adding a model or external dependency.

## License

Released under the MIT License. See [LICENSE](LICENSE).
