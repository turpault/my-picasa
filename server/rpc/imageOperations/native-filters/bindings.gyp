{
  "targets": [
    {
      "target_name": "png2bmp",
      "sources": [ "lut3d.cpp" ], 
      "cflags": ["-Wall", "-Wextra", "-pedantic", "-ansi", "-O3"],
      "include_dirs" : ["<!(node -e \"require('nan')\")"]
    }
  ]
}