; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
; Project name : ConvolutionFilter
; File Name : ConvolutionFilter - Example.pb
; File version: 1.0.0
; Programming : OK
; Programmed by : StarBootics
; Date : 28-11-2019
; Last Update : 28-11-2019
; PureBasic code : V5.71 LTS
; Platform : Windows, Linux, MacOS X
; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
; Programming notes
;
; Based on Keya original code :
;
; https://www.purebasic.fr/english/viewtopic.php?f=12&t=68204/Users/turpault/Downloads/ConvolutionFilter/ConvolutionFilter - OOP.pb
;
; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

IncludeFile "ConvolutionMatrix - OOP.pb"
IncludeFile "ConvolutionKernel - OOP.pb"
IncludeFile "ConvolutionFilter - OOP.pb"

Imgfile.s = #PB_Compiler_Home + "examples" + #PS$ + "sources" + #PS$ + "Data" + #PS$ + "PureBasicLogo.bmp" ;not very good for testing filters, use a photo!

ImageHandle00 = LoadImage(#PB_Any, Imgfile)

If Not ImageHandle00
  MessageRequester("Error","Couldnt load " + Imgfile)
  End
EndIf

ConvFilter.ConvolutionFilter::ConvolutionFilter = ConvolutionFilter::New()

If ConvFilter\SelectKernel("EMBOSS_V5", ConvolutionFilter::#Horizontal_Flip)
  ImageHandle01 = ConvFilter\FilterImage(ImageHandle00)
  ConvFilter\RestoreFlippedMatrix()
  ImageHandle02 = ConvFilter\FilterImage(ImageHandle00)
Else
  MessageRequester("Error", "Invalid kernel Name")
  End
EndIf

Width = ImageWidth(ImageHandle00)
Height = ImageHeight(ImageHandle00)

If OpenWindow(0, 0, 0, (width)+20, (height*3)+40, "3x3 Convolution Filter", #PB_Window_SystemMenu | #PB_Window_ScreenCentered)
  ImageGadget(#PB_Any, 10, 10, width, height, ImageID(ImageHandle00)) 
  ImageGadget(#PB_Any, 10, 20+height, width, height, ImageID(ImageHandle01)) 
  ImageGadget(#PB_Any, 10, (15+height)*2, width, height, ImageID(ImageHandle02)) 
  Repeat
    Event = WaitWindowEvent()
  Until Event = #PB_Event_CloseWindow
EndIf

; <<<<<<<<<<<<<<<<<<<<<<<
; <<<<< END OF FILE <<<<<
; <<<<<<<<<<<<<<<<<<<<<<<
; IDE Options = PureBasic 5.71 LTS (Linux - x64)
; EnableXP
; CompileSourceDirectory