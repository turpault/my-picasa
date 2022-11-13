#!/usr/bin/env zsh
for i in *.png                                                                          turpault@iMacMaison
do
convert "${i/-50/}" -resize 50x "${${i/-50.png/}/.png/}-50.png"
done

