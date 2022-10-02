
typedef struct {
    double x,
    double y,
    double z,
} Vec3;

typedef struct {
    r: double,
    g: double,
    b: double,
}  Pixel;



typedef struct  {
    c000: Vec3,
    c001: Vec3,
    c010: Vec3,
    c011: Vec3,
    c100: Vec3,
    c101: Vec3,
    c110: Vec3,
    c111: Vec3,
}Points;
typedef struct {
    c000: Pixel,
    c001: Pixel,
    c010: Pixel,
    c011: Pixel,
    c100: Pixel,
    c101: Pixel,
    c110: Pixel,
    c111: Pixel,
} Colors;

size_t index_from_pos(point: Vec3, data_size: size_t)  
{
    return size_t((((point.z) * (data_size as f64)) + (point.y)) * (data_size as f64) + point.x)        
}
Pixel color_from_vec(double* col) {
     Pixel r = {
        col[0],
        col[1],
        col[2],
    };
    return r;
}

double interpolate(double start , double end, double ratio)  {
    return (end - start) * ratio + start;
}
Pixel compute_pixel_value(
    Pixel pixel,
    size_t lut_data_size,
    double lut_data[][],
)  {
    // Get LUT values around the selected pixel color
    // Small trilinear interpolation with the LUT values around that color

    Vec3 pos_in_lut_matrix =  {
        x= pixel.r * (lut_data_size - 1) ,
        y=pixel.g * (lut_data_size - 1) ,
        z= pixel.b * (lut_data_size - 1) ,
    };
    Vec3 delta = {
        x=pos_in_lut_matrix.x - pos_in_lut_matrix.x.floor(),
        y=pos_in_lut_matrix.y - pos_in_lut_matrix.y.floor(),
        z=pos_in_lut_matrix.z - pos_in_lut_matrix.z.floor(),
    };

    // get the 8 points around
    Points points {
    c000 =  {x=            pos_in_lut_matrix.x.floor(),
            y=pos_in_lut_matrix.y.floor(),
            z=pos_in_lut_matrix.z.floor(),
        },
        c100 = {
            x= pos_in_lut_matrix.x.ceil(),
            y= pos_in_lut_matrix.y.floor(),
            z= pos_in_lut_matrix.z.floor(),
        },
        c010= {
            x= pos_in_lut_matrix.x.floor(),
            y= pos_in_lut_matrix.y.ceil(),
            z= pos_in_lut_matrix.z.floor(),
        },
        c110= {
            x= pos_in_lut_matrix.x.ceil(),
            y= pos_in_lut_matrix.y.ceil(),
            z= pos_in_lut_matrix.z.floor(),
        },
        c001= {
            x= pos_in_lut_matrix.x.floor(),
            y= pos_in_lut_matrix.y.floor(),
            z= pos_in_lut_matrix.z.ceil(),
        },
        c101= {
            x= pos_in_lut_matrix.x.ceil(),
            y= pos_in_lut_matrix.y.floor(),
            z= pos_in_lut_matrix.z.ceil(),
        },
        c011= {
            x= pos_in_lut_matrix.x.floor(),
            y= pos_in_lut_matrix.y.ceil(),
            z= pos_in_lut_matrix.z.ceil(),
        },
        c111= {
            x= pos_in_lut_matrix.x.ceil(),
            y= pos_in_lut_matrix.y.ceil(),
            z= pos_in_lut_matrix.z.ceil(),
        },
    };

    // interpolate the rgb value from a linear interpolation with the target point
    Colors colors =  {
        c000= color_from_vec(lut_data[index_from_pos(points.c000, lut_data_size)]),
        c001= color_from_vec(lut_data[index_from_pos(points.c001, lut_data_size)]),
        c010= color_from_vec(lut_data[index_from_pos(points.c010, lut_data_size)]),
        c011= color_from_vec(lut_data[index_from_pos(points.c011, lut_data_size)]),
        c100= color_from_vec(lut_data[index_from_pos(points.c100, lut_data_size)]),
        c101= color_from_vec(lut_data[index_from_pos(points.c101, lut_data_size)]),
        c110= color_from_vec(lut_data[index_from_pos(points.c110, lut_data_size)]),
        c111= color_from_vec(lut_data[index_from_pos(points.c111, lut_data_size)]),
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

    return  { r, g, b };
}



void apply_lut_impl(int width, int height, size_t pixel_width, Buffer pixels, size_t lut_size, double lut_data[][]) {

    // Assume rbg
    for(size_t i=0; i< pixels.len(); i+=pixel_width) {
        Pixel pix =  {
            r= double(pixels[i]) / 256.0,
            g= double (pixels[i + 1]) / 256.0,
            b= double(pixels[i + 2]) / 256.0,
        };
        auto updated = compute_pixel_value(pix, lut_size, &lut_data);

        pixels[i] = int(updated.r * 256.0)
        pixels[i + 1]= int(updated.g * 256.0);
        pixels[i + 2]= int(updated.b * 256.0);
    }
}


fn apply_lut(data: &PictureData, lut_data: &lut_parser::CubeLut<f64>) -> Vec<u8> {
  return apply_lut_impl(data.metadata.width as i32, data.metadata.height as i32, 3, &data.pixels, lut_data.size, lut_data.data);
}

#[cfg(test)]
mod tests {
    use crate::{read_lutfile, process_file};
    use std::fs::{read_dir};
    use std::ffi::OsString;
    use std::thread::{self};

    #[test]
    fn read_test_lut() {
        let result = read_lutfile("resources/lut/Arabica 12.CUBE");
        assert_eq!(result.size, 32);
    }

    #[test]
    fn make_all() {
        println!("Hello, world!");
        let paths = read_dir("resources/lut/").expect(&format!("cannot read resources folder "));

        //let mut handles = Vec::<JoinHandle<()>>::with_capacity(10);
        for path in paths {
            let unwrapped = path.unwrap();
            let p = unwrapped.path().display().to_string().to_ascii_lowercase();
            let f: OsString = unwrapped.file_name();
            let filename = f.to_str().unwrap().to_ascii_lowercase();
            if p.contains("cube") {
                let handle = thread::spawn(move || {
                    process_file(
                        "resources/moi.jpeg",
                        &p,
                        &format!("moi - {}.jpeg", &filename),
                    )
                });
                handle.join().unwrap();
            }
        }
    }
}