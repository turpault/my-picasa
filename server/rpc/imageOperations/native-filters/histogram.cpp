#include <napi.h>
using namespace Napi;

//  histogram(pixels: Buffer, pixel_size: number): number[];
Napi::Array histogram(const Napi::CallbackInfo &info)
{
  auto pixelsBuffer = info[0].As<Napi::Buffer<unsigned char>>();
  auto pixels = pixelsBuffer.Data();
  auto length = pixelsBuffer.Length();

  size_t pixel_size = info[1].ToNumber().Unwrap().Int32Value();
  double vals[256][3] = {{0}};
  for(size_t pix=0; pix<length; pix+=pixel_size) {
    vals[pixels[pix]][0]++;
    vals[pixels[pix+1]][1]++;
    vals[pixels[pix+2]][2]++;
  }
  Napi::Array resultR = Napi::Array::New(info.Env(), 256);
  Napi::Array resultG = Napi::Array::New(info.Env(), 256);
  Napi::Array resultB = Napi::Array::New(info.Env(), 256);
  for (int i = 0; i < 256; i++)
  {
    resultR[i] = Napi::Number::New(info.Env(), vals[i][0]);
    resultG[i] = Napi::Number::New(info.Env(), vals[i][1]);
    resultB[i] = Napi::Number::New(info.Env(), vals[i][2]);
  }
  Napi::Array result = Napi::Array::New(info.Env(),3);
  result.Set((uint32_t)0, resultR);
  result.Set((uint32_t)1, resultG);
  result.Set((uint32_t)2, resultB);

  return result;
}

Napi::Object Histogram(Napi::Env env, Napi::Object exports)
{
  exports.Set(Napi::String::New(env, "histogram"),
              Napi::Function::New(env, histogram));
  return exports;
}

NODE_API_MODULE(histogram, Histogram)