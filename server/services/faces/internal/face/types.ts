import * as faceapi from "@vladmandic/face-api";
import { Contact, Face } from "../../../shared/types/types";

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

export type IdentifiedContact = { face: Face; contact: Contact };
