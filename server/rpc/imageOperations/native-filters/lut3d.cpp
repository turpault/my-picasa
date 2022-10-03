#include <stddef.h>
#include <vector>
#include <math.h>

typedef struct
{
  double x;
  double y;
  double z;
} Vec3;

typedef struct
{
  double r;
  double g;
  double b;
} Pixel;

typedef struct
{
  Vec3 c000;
  Vec3 c001;
  Vec3 c010;
  Vec3 c011;
  Vec3 c100;
  Vec3 c101;
  Vec3 c110;
  Vec3 c111;
} Points;
typedef struct
{
  Pixel c000;
  Pixel c001;
  Pixel c010;
  Pixel c011;
  Pixel c100;
  Pixel c101;
  Pixel c110;
  Pixel c111;
} Colors;

size_t index_from_pos(Vec3 point, size_t data_size)
{
  return size_t((((point.z) * double(data_size)) + (point.y)) * double(data_size) + point.x);
}

Pixel color_from_vec(const std::vector<double> &col)
{
  Pixel res = {
      .r = col[0],
      .g = col[1],
      .b = col[2],
  };
  return res;
}

double interpolate(double start, double end, double ratio)
{
  return (end - start) * ratio + start;
}

Pixel compute_pixel_value(
    Pixel &pixel,
    size_t lut_data_size,
    const std::vector<std::vector<double>> &lut_data)
{
  // Get LUT values around the selected pixel color
  // Small trilinear interpolation with the LUT values around that color

  Vec3 pos_in_lut_matrix = {
      .x = pixel.r * double(lut_data_size - 1),
      .y = pixel.g * double(lut_data_size - 1),
      .z = pixel.b * double(lut_data_size - 1),
  };
  Vec3 delta = {
      .x = pos_in_lut_matrix.x - floor(pos_in_lut_matrix.x),
      .y = pos_in_lut_matrix.y - floor(pos_in_lut_matrix.y),
      .z = pos_in_lut_matrix.z - floor(pos_in_lut_matrix.z),
  };

  // get the 8 points around
  Points points{
      .c000 = {
          .x = floor(pos_in_lut_matrix.x),
          .y = floor(pos_in_lut_matrix.y),
          .z = floor(pos_in_lut_matrix.z),
      },
      .c100 = {
          .x = ceil(pos_in_lut_matrix.x),
          .y = floor(pos_in_lut_matrix.y),
          .z = floor(pos_in_lut_matrix.z),
      },
      .c010 = {
          .x = floor(pos_in_lut_matrix.x),
          .y = ceil(pos_in_lut_matrix.y),
          .z = floor(pos_in_lut_matrix.z),
      },
      .c110 = {
          .x = ceil(pos_in_lut_matrix.x),
          .y = ceil(pos_in_lut_matrix.y),
          .z = floor(pos_in_lut_matrix.z),
      },
      .c001 = {
          .x = floor(pos_in_lut_matrix.x),
          .y = floor(pos_in_lut_matrix.y),
          .z = ceil(pos_in_lut_matrix.z),
      },
      .c101 = {
          .x = ceil(pos_in_lut_matrix.x),
          .y = floor(pos_in_lut_matrix.y),
          .z = ceil(pos_in_lut_matrix.z),
      },
      .c011 = {
          .x = floor(pos_in_lut_matrix.x),
          .y = ceil(pos_in_lut_matrix.y),
          .z = ceil(pos_in_lut_matrix.z),
      },
      .c111 = {
          .x = ceil(pos_in_lut_matrix.x),
          .y = ceil(pos_in_lut_matrix.y),
          .z = ceil(pos_in_lut_matrix.z),
      },
  };

  // interpolate the rgb value from a linear interpolation with the target point
  Colors colors = {
      .c000 = color_from_vec(lut_data[index_from_pos(points.c000, lut_data_size)]),
      .c001 = color_from_vec(lut_data[index_from_pos(points.c001, lut_data_size)]),
      .c010 = color_from_vec(lut_data[index_from_pos(points.c010, lut_data_size)]),
      .c011 = color_from_vec(lut_data[index_from_pos(points.c011, lut_data_size)]),
      .c100 = color_from_vec(lut_data[index_from_pos(points.c100, lut_data_size)]),
      .c101 = color_from_vec(lut_data[index_from_pos(points.c101, lut_data_size)]),
      .c110 = color_from_vec(lut_data[index_from_pos(points.c110, lut_data_size)]),
      .c111 = color_from_vec(lut_data[index_from_pos(points.c111, lut_data_size)]),
  };

  auto ri1a = interpolate(colors.c000.r, colors.c100.r, delta.x);
  auto ri2a = interpolate(colors.c010.r, colors.c110.r, delta.x);
  auto ri1b = interpolate(colors.c001.r, colors.c101.r, delta.x);
  auto ri2b = interpolate(colors.c011.r, colors.c111.r, delta.x);
  auto rj1 = interpolate(ri1a, ri2a, delta.y);
  auto rj2 = interpolate(ri1b, ri2b, delta.y);
  auto r = interpolate(rj1, rj2, delta.z);

  auto gi1a = interpolate(colors.c000.g, colors.c100.g, delta.x);
  auto gi2a = interpolate(colors.c010.g, colors.c110.g, delta.x);
  auto gi1b = interpolate(colors.c001.g, colors.c101.g, delta.x);
  auto gi2b = interpolate(colors.c011.g, colors.c111.g, delta.x);
  auto gj1 = interpolate(gi1a, gi2a, delta.y);
  auto gj2 = interpolate(gi1b, gi2b, delta.y);
  auto g = interpolate(gj1, gj2, delta.z);

  auto bi1a = interpolate(colors.c000.b, colors.c100.b, delta.x);
  auto bi2a = interpolate(colors.c010.b, colors.c110.b, delta.x);
  auto bi1b = interpolate(colors.c001.b, colors.c101.b, delta.x);
  auto bi2b = interpolate(colors.c011.b, colors.c111.b, delta.x);
  auto bj1 = interpolate(bi1a, bi2a, delta.y);
  auto bj2 = interpolate(bi1b, bi2b, delta.y);
  auto b = interpolate(bj1, bj2, delta.z);

  return {r, g, b};
}

void apply_lut_impl(size_t pixel_width, unsigned char *pixels, size_t len, size_t lut_size, std::vector<std::vector<double>> lut_data)
{

  // Assume rbg
  for (size_t i = 0; i < len; i += pixel_width)
  {
    Pixel pix = {
        .r = double(pixels[i]) / 256.0,
        .g = double(pixels[i + 1]) / 256.0,
        .b = double(pixels[i + 2]) / 256.0,
    };
    auto updated = compute_pixel_value(pix, lut_size, lut_data);

    pixels[i] = floor(updated.r * 256.0);
    pixels[i + 1] = floor(updated.g * 256.0);
    pixels[i + 2] = floor(updated.b * 256.0);
  }
}

#include <napi.h>
using namespace Napi;

//  LUT3D.applyLUT(pixels: Buffer, lut_size: number, lutData: number[][]);
void applyLUT(const Napi::CallbackInfo &info)
{
  // void *argp = NULL;
  // Napi::Env env = info.Env();
  auto now = clock();
  printf("Getting params... \n");

  auto pixelsBuffer = info[0].As<Napi::Buffer<unsigned char>>();
  auto pixels = pixelsBuffer.Data();
  auto length = pixelsBuffer.Length();
  printf("Arg0 : %p (%lu)\n", pixels, length);

  size_t lut_size = info[1].ToNumber().Unwrap().Int32Value();
  printf("Arg1 : %lu\n", lut_size);

  auto lut_data = info[2].As<Napi::Array>();
  std::vector<std::vector<double>> lut;
  auto lutLength = lut_data.Length();
  lut.reserve(lutLength);
  printf("Arg2 : %d\n", lutLength);

  for (size_t i = 0; i < lutLength; i++)
  {
    auto lut_row = lut_data.Get(i).Unwrap().As<Napi::Array>();
    std::vector<double> row;
    size_t lut_width = 3; // Assume 3D Lut
    row.reserve(lut_width);
    for (size_t j = 0; j < lut_width; j++)
    {
      row.push_back(lut_row.Get(j).Unwrap().ToNumber().Unwrap().DoubleValue());
    }
    lut.push_back(row);
  }
  printf("Converting... %ld\n", clock() - now);
  // pixels[0] = 'Q';
  apply_lut_impl(3, pixels, length, lut_size, lut);
  printf("Done... %ld\n", clock() - now);
}

Napi::Object Lut3D(Napi::Env env, Napi::Object exports)
{
  exports.Set(Napi::String::New(env, "applyLUT"),
              Napi::Function::New(env, applyLUT));
  return exports;
}

NODE_API_MODULE(lut3d, Lut3D)