# 🎄 Tomato's Christmas Gift

An interactive Christmas gift web app with webcam functionality built with Vanilla JS and Vite.

## 🚀 Quick Start

1. **Install Vite (if needed):**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   - Navigate to `http://localhost:3000`
   - **Allow camera permissions** when prompted
   - Wait a moment for MediaPipe to load from CDN
   - Raise your hand to see the tracking!

4. **Build for production:**
   ```bash
   npm run build
   ```

> **Note:** MediaPipe Hands loads directly from CDN (no npm packages needed!)

## 📁 Project Structure

```
├── index.html      # Main HTML structure
├── style.css       # Styling with mirrored canvas effect
├── main.js         # Camera setup and render logic
├── package.json    # Dependencies
└── vite.config.js  # Vite configuration
```

## ✨ Features

- ✅ Full-screen mirrored webcam feed (selfie mode)
- ✅ **MediaPipe Hands integration** - Real-time hand tracking
- ✅ Visual hand skeleton overlay (red connections, cyan landmarks)
- ✅ Gesture detection (Index finger up detection)
- ✅ Smooth 60fps video rendering with `requestAnimationFrame`
- ✅ Responsive canvas that adapts to window resize
- ✅ Clean UI overlay system for future interactions
- ✅ Error handling for camera permissions

## 🎨 Customization

The app is built with modularity in mind. You can easily extend it by:
- Adding interactive elements to the `#ui-layer`
- Applying filters/effects in the `render()` loop
- Integrating face detection libraries
- Adding Christmas-themed overlays

## 📝 Notes

- Camera permissions are required for the app to work
- The canvas uses `transform: scaleX(-1)` for mirror effect
- Video stream uses "user" facing mode (front camera)

---

**Made with ❤️ for Tomato's Christmas 2025**

