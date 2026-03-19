import * as faceapi from "@vladmandic/face-api";

export type FaceLandmarkData = { hash?: string } & faceapi.WithAge<
  faceapi.WithGender<
    faceapi.WithFaceExpressions<
      faceapi.WithFaceDescriptor<
        faceapi.WithFaceLandmarks<
          {
            detection: faceapi.FaceDetection;
          },
          faceapi.FaceLandmarks68
        >
      >
    >
  >
>;

/** Re-export for internal use; public API uses shared/types */
export type { IdentifiedContact } from "../../../../shared/types/types";
