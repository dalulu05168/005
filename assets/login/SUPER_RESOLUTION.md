# Background resolution and provenance

Source: generated raster, 1672×941. Local reconstruction uses the FSRCNN ×4 model from https://github.com/Saafke/FSRCNN_Tensorflow (Apache-2.0), through OpenCV dnn_superres. Model output 6688×3764 is resampled with Lanczos to exactly 7680×4320 and encoded as WebP quality 94. The delivery derivative is 3840×2160. This is enhanced resolution, not native 8K artwork, and does not add independently authored scene details.

The model is a development tool and is not shipped or downloaded by the browser. No Krea credits or third-party generation requests are required at runtime. The WebGL renderer bounds texture uploads by MAX_TEXTURE_SIZE, selects the 8K asset only for physical widths over 3840 and supported hardware, pauses on hidden documents, freezes under reduced motion, and disposes on successful login.

Linux WebKitGTK/WPE uses the Canvas 2D water renderer because its software WebGL texture path can crash the browser process. This is an actual runtime compatibility fallback, not test injection. Water remains animated, reduced motion still freezes it, and renderer resources are released after login.
