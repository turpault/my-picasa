# PICISA

PICISA is a modern, electron-based photo management application designed to be a powerful Picasa replacement. It offers a comprehensive set of features for organizing, editing, and viewing your photo collection.

## Overview

- Built with Electron and TypeScript
- Modern UI with intuitive controls
- Fast and efficient photo processing using Sharp
- Support for multiple image formats
- Advanced editing capabilities

## Setup and Installation

### Prerequisites
- Node.js (Latest LTS version recommended)
- npm (comes with Node.js)
- Git

### Development Setup
1. Clone the repository:
   ```bash
   git clone git@github.com:turpault/my-picasa.git
   cd picisa
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build native filters:
   ```bash
   npm run native-filters
   ```

4. Start the development server:
   ```bash
   npm start
   ```

### Building for Production
1. Clean previous builds:
   ```bash
   npm run clean
   ```

2. Build the application:
   ```bash
   npm run build
   ```

3. Package for macOS:
   ```bash
   npm run deploy
   ```
   This will:
   - Create a DMG installer
   - Install the application to /Applications (requires admin privileges)
   - Set up the launch daemon for background services

### Available Scripts
- `npm run start` - Start development server with hot reload
- `npm run build` - Build production version
- `npm run deploy` - Package and deploy application
- `npm run clean` - Clean build artifacts
- `npm run reset` - Clean node_modules and build artifacts
- `npm run electron` - Start Electron app directly

## Features

### Photo Management
- [x] Import and organize photos
- [x] Create and manage albums
- [x] Search and filter photos
- [x] Sort by date, name, and other attributes
- [x] Manage favorites
- [x] Support for multiple file formats (JPG, PNG, GIF, HEIC)
- [x] Video file support
- [x] Support for animated GIFs
- [ ] RAW file support (planned)
- [ ] WebP support (planned)
- [ ] SVG support (planned)

### Photo Editing
- [x] Basic adjustments
  - Brightness
  - Contrast
  - Saturation
  - Hue
- [x] Advanced filters
  - LUT3D color grading
  - Auto color correction
  - Gamma adjustment
  - Posterize effect
  - Heatmap visualization
  - Blur and sharpen
  - Emboss effect
  - Edge detection
- [x] Transform tools
  - Crop
  - Rotate
  - Resize
- [x] Export with custom settings

### Creative Tools
- [x] Create photo collages
- [x] Generate slideshows
- [x] Export to various formats

### Organization
- [x] Album management
- [x] Custom sorting options
- [ ] Face recognition grouping (planned)
- [ ] Location-based grouping (planned)
- [ ] Date-based grouping (planned)

### Additional Features
- [x] Keyboard shortcuts for quick navigation
- [x] Bug reporting system
- [x] Fast image preview
- [x] Multi-monitor support
- [x] Customizable workspace

## Development

This project is actively maintained and developed. For bug reports or feature requests, please use the GitHub issues system.

## License

MIT License - See LICENSE file for details
