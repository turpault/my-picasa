#include <napi.h>
using namespace Napi;

//  solarize(pixels: Buffer, pixel_size: number, threshold: number): number[];
Napi::Number solarize(const Napi::CallbackInfo &info)
{
  auto pixelsBuffer = info[0].As<Napi::Buffer<unsigned char>>();
  auto pixels = pixelsBuffer.Data();
  auto length = pixelsBuffer.Length();

  size_t pixel_size = info[1].ToNumber().Unwrap().Int32Value();
  int threshold = info[2].ToNumber().Unwrap().Int32Value();
  for(size_t pix=0; pix<length; pix+=pixel_size) {
    if(pixels[pix] > threshold) {
      pixels[pix] = 255 - pixels[pix];
    }
    if(pixels[pix+1] > threshold) {
      pixels[pix+1] = 255 - pixels[pix+1];
    }
    if(pixels[pix+2] > threshold) {
      pixels[pix+2] = 255 - pixels[pix+2];
    }
  }
  return Napi::Number::New(info.Env(), 0);
}

Napi::Object Solarize(Napi::Env env, Napi::Object exports)
{
  exports.Set(Napi::String::New(env, "solarize"),
              Napi::Function::New(env, solarize));
  return exports;
}

NODE_API_MODULE(solarize, Solarize)