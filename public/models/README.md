# Local person segmentation model

`selfie_segmenter.tflite` is the MediaPipe Selfie Segmenter (square, float16) model from Google's official MediaPipe model bucket. It identifies prominent people and background; it is not a general-purpose object selector.

- Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf
- Model license: Apache License 2.0, as stated in the model card.
- Model authors: Tingbo Hou, Siargey Pisarchyk, and Karthik Raveendran (Google).
- Model file: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

The MediaPipe Tasks Vision runtime assets in `../mediapipe/wasm/` are from `@mediapipe/tasks-vision` 1.0.1 and are also Apache-2.0 licensed. The runtime and model are loaded from this application and execute in the user's browser.
