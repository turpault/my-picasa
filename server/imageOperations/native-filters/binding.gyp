{
   "targets": [
       {
      "target_name": "lut3d",
      "sources": [ "lut3d.cpp" ], 
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       },
       {
      "target_name": "histogram",
      "sources": [ "histogram.cpp" ], 
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       },
       {
      "target_name": "solarize",
      "sources": [ "solarize.cpp" ], 
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       }
       ,
       {
      "target_name": "heatmap",
      "sources": [ "heatmap.cpp" ], 
           'include_dirs': [
               '<!(node -p "require(\'node-addon-api\').include_dir")'
           ],
           'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS',
                        'NODE_ADDON_API_ENABLE_MAYBE' ],
           'conditions': [
               ['OS=="mac"', {
                   'cflags+': ['-fvisibility=hidden'],
                   'xcode_settings': {
                       'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
                   }
               }]
           ]
       }
   ]
}