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

DeclareModule ConvolutionKernel
  
  Enumeration 
    
    #FLIPPED_NOT_FLIPPED
    #FLIPPED_VERTICALLY
    #FLIPPED_HORIZONTALLY
    
  EndEnumeration
  
  Interface ConvolutionKernel
    
    GetMatrix.i()
    GetMatrixElement.f(P_i.l, P_j.l)
    GetScale.f()
    GetOffset.a()
    GetFlipped.b()
    SetScale(P_Scale.f)
    SetOffset(P_Offset.a)
    SetFlipped(P_Flipped.b)
    Free()
    
  EndInterface
  
  Declare.i New(*P_Matrix.ConvolutionMatrix::ConvolutionMatrix = #Null, P_Scale.f = 0.0, P_Offset.a = 0, P_Flipped.b = 0)
  
EndDeclareModule

Module ConvolutionKernel
  
  ; <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< Structure declaration <<<<<

  Structure Private_Members
    
    VirtualTable.i
    Matrix.ConvolutionMatrix::ConvolutionMatrix
    Scale.f
    Offset.a
    Flipped.b
    
  EndStructure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The Getters <<<<<

  Procedure.i GetMatrix(*This.Private_Members)
    
    ProcedureReturn *This\Matrix
  EndProcedure
  
  Procedure.f GetMatrixElement(*This.Private_Members, P_i.l, P_j.l)
    
    If P_i = 0 And P_j = 0 
      Output.f = *This\Matrix\GetE11()
    EndIf
    
    If P_i = 1 And P_j = 0 
      Output.f = *This\Matrix\GetE21()
    EndIf
    
    If P_i = 2 And P_j = 0 
      Output.f = *This\Matrix\GetE31()
    EndIf
    
    If P_i = 0 And P_j = 1 
      Output.f = *This\Matrix\GetE12()
    EndIf
    
    If P_i = 1 And P_j = 1 
      Output.f = *This\Matrix\GetE22()
    EndIf
    
    If P_i = 2 And P_j = 1 
      Output.f = *This\Matrix\GetE32()
    EndIf
    
    If P_i = 0 And P_j = 2 
      Output.f = *This\Matrix\GetE13()
    EndIf
    
    If P_i = 1 And P_j = 2 
      Output.f = *This\Matrix\GetE23()
    EndIf
    
    If P_i = 2 And P_j = 2 
      Output.f = *This\Matrix\GetE33()
    EndIf
    
    ProcedureReturn Output
  EndProcedure

  Procedure.f GetScale(*This.Private_Members)
    
    ProcedureReturn *This\Scale
  EndProcedure
  
  Procedure.a GetOffset(*This.Private_Members)
    
    ProcedureReturn *This\Offset
  EndProcedure
  
  Procedure.b GetFlipped(*This.Private_Members)
    
    ProcedureReturn *This\Flipped
  EndProcedure

  ; <<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The Setters <<<<<
  
  Procedure SetScale(*This.Private_Members, P_Scale.f)
    
    *This\Scale = P_Scale
    
  EndProcedure
  
  Procedure SetOffset(*This.Private_Members, P_Offset.a)
    
    *This\Offset = P_Offset
    
  EndProcedure
  
  Procedure SetFlipped(*This.Private_Members, P_Flipped.a)
    
    *This\Flipped = P_Flipped
    
  EndProcedure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< the Destructor <<<<<

  Procedure Free(*This.Private_Members)
    
    If *This\Matrix <> #Null
      *This\Matrix\Free()
    EndIf
    
    ClearStructure(*This, Private_Members)
    FreeStructure(*This)
    
  EndProcedure
  
  ; <<<<<<<<<<<<<<<<<<<<<<<<<<<
  ; <<<<< The Constructor <<<<<

  Procedure.i New(*P_Matrix.ConvolutionMatrix::ConvolutionMatrix = #Null, P_Scale.f = 0.0, P_Offset.a = 0, P_Flipped.b = 0)
    
    *This.Private_Members = AllocateStructure(Private_Members)
    *This\VirtualTable = ?START_METHODS
    
    If *P_Matrix <> #Null
      *This\Matrix = *P_Matrix
    Else
      *This\Matrix = ConvolutionMatrix::New()
    EndIf
    
    *This\Scale = P_Scale
    *This\Offset = P_Offset
    
    ProcedureReturn *This
  EndProcedure
  
  DataSection
    START_METHODS:
    Data.i @GetMatrix()
    Data.i @GetMatrixElement()
    Data.i @GetScale()
    Data.i @GetOffset()
    Data.i @GetFlipped()
    Data.i @SetScale()
    Data.i @SetOffset()
    Data.i @SetFlipped()
    Data.i @Free()
    END_METHODS:
  EndDataSection
  
EndModule

; <<<<<<<<<<<<<<<<<<<<<<<
; <<<<< END OF FILE <<<<<
; <<<<<<<<<<<<<<<<<<<<<<<
; IDE Options = PureBasic 5.71 LTS (Linux - x64)
; Folding = fA+
; EnableXP
; CompileSourceDirectory