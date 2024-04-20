#include <napi.h>
using namespace Napi;

//  heatmap(pixels: Buffer, pixel_size: number): number[];
Napi::Number heatmap(const Napi::CallbackInfo &info)
{
  auto pixelsBuffer = info[0].As<Napi::Buffer<unsigned char>>();
  auto pixels = pixelsBuffer.Data();
  auto length = pixelsBuffer.Length();

  size_t pixel_size = info[1].ToNumber().Unwrap().Int32Value();
  for(size_t pix=0; pix<length; pix+=pixel_size) {
    auto average = (pixels[pix] + pixels[pix + 1] + pixels[pix + 2]) / 3;
    if(pixels[pix] > pixels[pix + 1] && pixels[pix] > pixels[pix + 2]) {
      pixels[pix] = fmax(pixels[pix] * 1.5, 255);
      pixels[pix + 1] = average;
      pixels[pix + 2] = average;
    } else if(pixels[pix + 1] > pixels[pix] && pixels[pix + 1] > pixels[pix + 2]) {
      pixels[pix] = average;
      pixels[pix + 1] = fmax(pixels[pix+1] * 1.5, 255);;
      pixels[pix + 2] = average;
    } else if(pixels[pix + 2] > pixels[pix] && pixels[pix + 2] > pixels[pix + 1]) {
      pixels[pix] = average;
      pixels[pix + 1] = average;
      pixels[pix + 2] = fmax(pixels[pix+2] * 1.5, 255);;
    }
  }

  return Napi::Number::New(info.Env(), 0);
}

Napi::Object Heatmap(Napi::Env env, Napi::Object exports)
{
  exports.Set(Napi::String::New(env, "heatmap"),
              Napi::Function::New(env, heatmap));
  return exports;
}

NODE_API_MODULE(heatmap, Heatmap)