; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
; Project name : ConvolutionFilter
; File name : ConvolutionKernel - OOP.pb
; File Version : 1.0.0
; Programmation : OK
; Programmed by : StarBootics
; Date : 24-11-2019
; Last Update : 24-11-2019
; Coded for PureBasic : V5.71 LTS
; Platform : Windows, Linux, MacOS X
; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
; Programming notes
;
; Based on Keya original code :
;
; https://www.purebasic.fr/english/viewtopic.php?f=12&t=68204
;
; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

DeclareModule ConvolutionMatrix
  
  Interface ConvolutionMatrix
    
    GetE11.f()
    GetE21.f()
    GetE31.f()
    GetE12.f()
    GetE22.f()
    GetE32.f()
    GetE13.f()
    GetE23.f()
    GetE33.f()
    SetE11(P_e11.f)
    SetE21(P_e21.f)
    SetE31(P_e31.f)
    SetE12(P_e12.f)
    SetE22(P_e22.f)
    SetE32(P_e32.f)
    SetE13(P_e13.f)
    SetE23(P_e23.f)
    SetE33(P_e33.f)
    FlipVertically()
    FlipHorizontally()
    Free()
    
  EndInterface
  
  Declare.i New(P_e11.f = 0.0, P_e21.f = 0.0, P_e31.f = 0.0, P_e12.f = 0.0, P_e22.f = 0.0, P_e32.f = 0.0, P_e13.f = 0.0, P_e23.f = 0.0, P_e33.f = 0.0)
  
EndDeclareModule

Module ConvolutionMatrix
  
  ; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< Structure declaration <<<<<

  Structure Private_Members
    
    VirtualTable.i
    e11.f
    e21.f
    e31.f
    e12.f
    e22.f
    e32.f
    e13.f
    e23.f
    e33.f
    
  EndStructure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The getters <<<<<

  Procedure.f GetE11(*This.Private_Members)
    
    ProcedureReturn *This\e11
  EndProcedure
  
  Procedure.f GetE21(*This.Private_Members)
    
    ProcedureReturn *This\e21
  EndProcedure
  
  Procedure.f GetE31(*This.Private_Members)
    
    ProcedureReturn *This\e31
  EndProcedure
  
  Procedure.f GetE12(*This.Private_Members)
    
    ProcedureReturn *This\e12
  EndProcedure
  
  Procedure.f GetE22(*This.Private_Members)
    
    ProcedureReturn *This\e22
  EndProcedure
  
  Procedure.f GetE32(*This.Private_Members)
    
    ProcedureReturn *This\e32
  EndProcedure
  
  Procedure.f GetE13(*This.Private_Members)
    
    ProcedureReturn *This\e13
  EndProcedure
  
  Procedure.f GetE23(*This.Private_Members)
    
    ProcedureReturn *This\e23
  EndProcedure
  
  Procedure.f GetE33(*This.Private_Members)
    
    ProcedureReturn *This\e33
  EndProcedure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The setters <<<<<

  Procedure SetE11(*This.Private_Members, P_e11.f)
    
    *This\e11 = P_e11
    
  EndProcedure
  
  Procedure SetE21(*This.Private_Members, P_e21.f)
    
    *This\e21 = P_e21
    
  EndProcedure
  
  Procedure SetE31(*This.Private_Members, P_e31.f)
    
    *This\e31 = P_e31
    
  EndProcedure
  
  Procedure SetE12(*This.Private_Members, P_e12.f)
    
    *This\e12 = P_e12
    
  EndProcedure
  
  Procedure SetE22(*This.Private_Members, P_e22.f)
    
    *This\e22 = P_e22
    
  EndProcedure
  
  Procedure SetE32(*This.Private_Members, P_e32.f)
    
    *This\e32 = P_e32
    
  EndProcedure
  
  Procedure SetE13(*This.Private_Members, P_e13.f)
    
    *This\e13 = P_e13
    
  EndProcedure
  
  Procedure SetE23(*This.Private_Members, P_e23.f)
    
    *This\e23 = P_e23
    
  EndProcedure
  
  Procedure SetE33(*This.Private_Members, P_e33.f)
    
    *This\e33 = P_e33
    
  EndProcedure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The Flip operator <<<<<
  
  Procedure FlipVertically(*This.Private_Members)
    
    Swap *This\e11, *This\e31
    Swap *This\e12, *This\e32
    Swap *This\e13, *This\e33
    
  EndProcedure
  
  Procedure FlipHorizontally(*This.Private_Members)
    
    Swap *This\e11, *This\e13
    Swap *This\e21, *This\e23
    Swap *This\e31, *This\e33
    
  EndProcedure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The Destructor <<<<<

  Procedure Free(*This.Private_Members)
    
    ClearStructure(*This, Private_Members)
    FreeStructure(*This)
    
  EndProcedure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The Constructor <<<<<

  Procedure.i New(P_e11.f = 0.0, P_e21.f = 0.0, P_e31.f = 0.0, P_e12.f = 0.0, P_e22.f = 0.0, P_e32.f = 0.0, P_e13.f = 0.0, P_e23.f = 0.0, P_e33.f = 0.0)
    
    *This.Private_Members = AllocateStructure(Private_Members)
    *This\VirtualTable = ?START_METHODS
    
    *This\e11 = P_e11
    *This\e21 = P_e21
    *This\e31 = P_e31
    *This\e12 = P_e12
    *This\e22 = P_e22
    *This\e32 = P_e32
    *This\e13 = P_e13
    *This\e23 = P_e23
    *This\e33 = P_e33
    
    ProcedureReturn *This
  EndProcedure
  
  DataSection
    START_METHODS:
    Data.i @GetE11()
    Data.i @GetE21()
    Data.i @GetE31()
    Data.i @GetE12()
    Data.i @GetE22()
    Data.i @GetE32()
    Data.i @GetE13()
    Data.i @GetE23()
    Data.i @GetE33()
    Data.i @SetE11()
    Data.i @SetE21()
    Data.i @SetE31()
    Data.i @SetE12()
    Data.i @SetE22()
    Data.i @SetE32()
    Data.i @SetE13()
    Data.i @SetE23()
    Data.i @SetE33()
    Data.i @FlipVertically()
    Data.i @FlipHorizontally()
    Data.i @Free()
    END_METHODS:
  EndDataSection
  
EndModule

; <<<<<<<<<<<<<<<<<<<<<<<
; <<<<< END OF FILE <<<<<
; <<<<<<<<<<<<<<<<<<<<<<<
; IDE Options = PureBasic 5.71 LTS (Linux - x64)
; Folding = -----
; EnableXP
; CompileSourceDirectory