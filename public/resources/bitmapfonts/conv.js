var parseString = require('xml2js').parseStringPromise;
const fs = require('fs');

const dat = fs.readFileSync(process.argv[2]);
parseString(dat).then(xml =>{
fs.renameSync(process.argv[2], 'orig/'+process.argv[2])
outputDestFile(process.argv[2], xml.font);
});

function outputDestFile(filename, json) {
  function pushInArr(arr, obj) {
    for (var key in obj) {
      var v = obj[key];
      if (key === "letter") {
        v = '"' + v + '"';
      } 
      arr.push(key + '=' + v);
    }
  }

  var infoArr = ['info'];
  pushInArr(infoArr, json.info[0].$);

  var rst = [infoArr.join(' ')];

  var commArr = ['common'];
  pushInArr(commArr, json.common[0].$);
  rst.push(commArr.join(' '));

  const pages = json.pages;
  let idx=0;
  for(const page of pages[0].page) {
    var pageArr = ['page'];
    pageArr.push('id=' + page.$.id);
    pageArr.push('file="' + page.$.file + '"');
    rst.push(pageArr.join(' '));
  }

  var charsArr = ['chars'];
  charsArr.push('count=' + json.chars[0].char.length);
  rst.push(charsArr.join(' '));

  for (const char of json.chars[0].char) {
    var charArr = ['char'];
    pushInArr(charArr, char.$);
    rst.push(charArr.join(' '));
  }

  var kernArr = ['kernings'];
  kernArr.push('count=' + json.kernings[0].kerning.length);
  rst.push(kernArr.join(' '));
  for (const kern of json.kernings[0].kerning) {
    var charArr = ['kerning'];
    pushInArr(charArr, kern.$);
    rst.push(charArr.join(' '));
  }

  rst.push('');
  fs.writeFileSync(filename, rst.join('\n'));
}

