const path =        require('path'),
    fs =            require('fs'),
    fsp =           require('fs').promises,
    zipFolder =     require('zip-folder'),

    inputFolder =   process.argv[2] || path.join(__dirname, 'sap-hana-ddl');
    outputFolder =  process.argv[3] || path.join(__dirname, 'src');
    zipFile =       process.argv[4] || path.join(__dirname, 'src.zip');

    let tableCounter = {};

async function traverseDir(dir, first) {
  // рекурсивный перебор файлов
  const files = await fsp.readdir(dir);
  try {
    await Promise.all(
      files.map(file =>
        (async () => {
          try {
            const fullPath = path.join(dir, file);
            const stats = await fsp.lstat(fullPath);
            if (stats.isDirectory()) {
              await traverseDir(fullPath);
            } else {
              let arr = fullPath.split('_');
              if (arr[arr.length-1] === 'table.sql' || arr[arr.length-1] === 'tables.sql') { await replaceTable(fullPath) } // обрабатывать файлы, оканчивающиеся на _table.sql
              else
              if (arr[arr.length-1] === 'fk.sql') { await replaceFk(fullPath) } // обрабатывать файлы, оканчивающиеся на _fk.sql
              else
              if (arr[arr.length-1] === 'init.sql') { await replaceInit(fullPath) } // обрабатывать файлы, оканчивающиеся на _init.sql
              else { console.warn('\x1b[33m%s\x1b[0m', 'File has been skipped: "' + fullPath + '"') };
            }
          } catch (err) {
            return console.log(err);
          }
        })(),
      ),
    );
  } catch (err) {
    return console.log('\x1b[31m%s\x1b[0m', 'Unable to scan directory: ' + err);
  }
}

async function fileData (file) {
  console.log(file);
  let data = await fsp.readFile(file, 'utf8');
  if (!data) {
    return { data };
  }
  let createString = data.match(/\"\w+\:\:/);
  let lastChar = createString[0].indexOf('::');
  let entity = createString[0].slice(1, lastChar);
  let fileName = path.dirname(file).split(path.sep).pop();

  if (!fs.existsSync(outputFolder)) { fs.mkdirSync(outputFolder) }

  let newFolder = path.join(outputFolder, entity);
  if (!fs.existsSync(newFolder)) { fs.mkdirSync(path.join(newFolder)) };

  let newName = path.join(newFolder, fileName);
  return { data, newName, entity, fileName, newFolder };
}

async function replaceInit(file) {

  let { data, newName, entity, fileName, newFolder } = await fileData (file);

  if (!data) {
      console.warn('\x1b[33m%s\x1b[0m', 'File is empty: "' + file + '"');
      return;
  }

  data = data
      .replace(/\r/g, "") // перевести систему пробелов из CRLF в LF
      .replace(/\)\nVALUES/g, ') VALUES')
      .replace(/VALUES\s\(/g, 'VALUES(');
  
  var arr = data.split(/\n\n\n/);

  arr.forEach( value => {
    var columnNames = value.match(/\"\(\"[\w+\s\,\"]+\) VALUES/g);
    var maxCoulumnNames = columnNames.reduce(function (a, b) { return a.length > b.length ? a : b; }).slice(2,-8);
    var maxCoulumnNamesClear = maxCoulumnNames.replace(/\"/g, '').replace(/\s/g, '');
    var values = value.replace(/INSERT INTO[\w+\s\,\"\:\(\)]+ VALUES\((.+)\)\;/g, '$1').replace(/\'/g, '');
    var numberOfColumns = maxCoulumnNamesClear.split(',').length;
    var rows = values.split('\n');
    var newRows = '';
    rows.forEach( value => {
      var elements = value.split(',');
      let newRow = '';
      for(i = 0; i < numberOfColumns; i++) {
        if (elements[i]) {
          newRow = newRow + elements[i] + ',';
        }
        else {
          newRow = newRow + ',';
        }
      }
      newRows = newRows + newRow.slice(0, -1) + '\n';
    });

    let tableName = value.match(/\:\:\w+\"\(\"/)[0].match(/\w+/)[0];
    console.log(tableName, ' ', numberOfColumns);

    var hdbtabledata = `{
        "format_version": 1,
        "imports": [
            {
                "target_table": "${entity}::${fileName}.${tableName}",
                "source_data": {
                    "data_type": "CSV",
                    "file_name": "${entity}::${tableName}.csv",
                    "has_header": true
                },
                "import_settings": {
                    "import_columns": [
                        ${maxCoulumnNames}
                    ]
                }
            }
        ]
    }`;

    let fullFileName = path.join(newFolder, tableName) + '.hdbtabledata';
    fs.writeFileSync(fullFileName, hdbtabledata, 'utf8');
    fullFileName = path.join(newFolder, tableName) + '.csv';
    fs.writeFileSync(fullFileName, maxCoulumnNamesClear + '\n' + newRows.slice(0, -1), 'utf8');
    console.log('\t', fullFileName);
  });

}

async function replaceFk(file) {

    let { data, newName, entity, fileName, newFolder } = await fileData (file);

    if (!data) {
        console.warn('\x1b[33m%s\x1b[0m', 'File is empty: "' + file + '"');
        return;
    }

    data = data
        .replace(/\r/g, "") // перевести систему пробелов из CRLF в LF
        .replace(/(\/\*).*(\*\/)\n/g, '') // удалить комментарии
        .replace(/ALTER TABLE (\"\w+)\:\:([\w\.]+\") ADD CONSTRAINT\s\"(\w+\") (.+)/g, 'CONSTRAINT $1::$3 ON $1::$2 $4');
    
    // Все в один файл:
    // newName = newName + '.hdbconstraint';
    // fs.writeFileSync(newName, data, 'utf8');

    arr = data.match(/CONSTRAINT .*\;/g);

    arr.forEach( value => {
        let fileName = value.match(/\:\:\w+\" ON/)[0].match(/\w+/)[0];
        fileName = path.join(newFolder, fileName) + '.hdbconstraint';
        fs.writeFileSync(fileName, value, 'utf8');
        console.log('\t', fileName);
    });

}

async function replaceTable(file) {

    let { data, newName, entity, fileName } = await fileData (file);

    if (!data) {
        console.warn('\x1b[33m%s\x1b[0m', 'File is empty: "' + file + '"');
        return;
    }

    // Счётчик количества таблиц по entity
    if (tableCounter[entity]) { tableCounter[entity] = tableCounter[entity] + data.match(/CREATE TABLE/g).length }
    else tableCounter[entity] = data.match(/CREATE TABLE/g).length;

    data = data
        .replace(/\r/g, "") // перевести систему пробелов из CRLF в LF
        .replace(/(\/\*).*(\*\/)/g, '') // удалить комментарии
        .replace(/\n\nDROP.*\;/g, ''); // удалить DROP

    data = constraints(data);

    data = data
        .replace(/(\s\s.*[^\,\(\t\s]$)/gm, '$1;') // добавить ; в конце последней строки (нет , ()
        .replace(/\n\)\;/g, `\n}\ntechnical configuration {\n\tcolumn store;\n};`)
        .replace(/CREATE TABLE/g, 'entity')
        .replace(/NOT NULL GENERATED BY DEFAULT AS IDENTITY/g, 'generated by default as identity(start with 1 increment by 1 no minvalue no maxvalue no cache no cycle)')
        .replace(/IDENTITY\(1,1\) NOT NULL/g, 'generated by default as identity(start with 1 increment by 1 no minvalue no maxvalue no cache no cycle)')
        .replace(/NOT NULL/g, 'not null')
        .replace(/ NULL/g, ' null')
        .replace(/(N)('.*')/g, '$2') // default N'@UNKNOWN'
        .replace(/DEFAULT/g, 'default')
        .replace(/AS COALESCE/g, ': Integer = COALESCE')
        .replace(/null default\s([\w\.]+)/g, 'null default \'$1\'') // добавить кавычки
        .replace(/\'current_timestamp\'/ig, 'current_timestamp') // убрать кавчки

        .replace(/SMALLINT/g, ': Integer')
        .replace(/NVARCHAR\(/g, ': String(')
        .replace(/VARCHAR\(/g, ': String(')
        .replace(/NCHAR\(/g, ': String(')
        .replace(/BIGINT/g, ': Integer64')
        .replace(/TINYINT/g, ': Integer')
        .replace(/INTEGER/g, ': Integer')
        .replace(/\sINT/g, ' : Integer')
        .replace(/REAL/g, ': Decimal(24,6)')
        .replace(/FLOAT/g, ': Decimal(24,6)')
        .replace(/NUMERIC/g, ': Decimal')
        .replace(/DECIMAL/g, ': Decimal')
        .replace(/ TIMESTAMP/g, ' : UTCTimestamp')
        .replace(/VARBINARY/g, ': Binary(100)')
        .replace(/BINARY/g, ': Binary(100)')
        .replace(/TEXT/g, ': LargeString')
        .replace(/DATETIME/g, ': UTCDateTime')
        .replace(/DATE/g, ': LocalDate')
        .replace(/BIT/g, ': Integer')
        .replace(/\(max\)/g, '(5000)')
        
        .replace(/\"\s?\(/g, '"{') // скобка после названия таблицы
        .replace(/\/\*w*\*\//g, '') // убрать комментарии
        .replace(/\,$/gm, ';') // ; в конце каждоый строки вместо ,
        .replace(/^/gm, "\t") // добавить табуляцию в начало строки
        .replace(/\n\t\n\t\n/gm, '\n\n') // лишние пустые строки
        .replace(/(\w+\:\:\w+\.)(\w+)/g, '$2'); // название таблицы

        data = `namespace ${entity};\n\ncontext ${fileName} {\n${data}\n\n};`; // добавление кода в начало и конец файла
    
    newName = newName + '.hdbcds';
    fs.writeFileSync(newName, data, 'utf8');
    console.log('\t', newName);

}

let zipping = () => {
    zipFolder(outputFolder, zipFile, function(err) {
        if(err) {
            console.log('\x1b[31m%s\x1b[0m', 'Zipping error', err);
        } else {
            console.log('\x1b[32m%s\x1b[0m', 'Zipped');
        }
    })
    console.log('Number of tables: ', tableCounter);
};

let deleteFolderRecursive = outputPath => {
    if (fs.existsSync(outputPath)) {
      fs.readdirSync(outputPath).forEach(function(file, index){
        var curPath = path.join(outputPath, file);
        if (fs.lstatSync(curPath).isDirectory()) { // recurse
          deleteFolderRecursive(curPath);
        } else { // delete file
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(outputPath);
    }
    if (!fs.existsSync(outputFolder)) { fs.mkdirSync(outputFolder) };
    if (fs.existsSync(path.join(outputFolder, zipFile))) { fs.unlinkSync(path.join(outputFolder, zipFile)) };
};

let constraints = file => {

    arr = file.match(/ALTER TABLE .* PRIMARY KEY .*\)\;/g) || []; // поиск всех constraints на primary key
    file = file.replace(/(ALTER.+)\;/g, '// $1'); // закомментировать все constrains
    if (!arr.length) {return file};

    let b = [];

    arr.forEach((value, index) => {
        b[index] = {};
        b[index].tableName = value.replace(/ALTER TABLE \"(.+)\" ADD .*/g, '$1');
        b[index].fields = JSON.parse('[' + value.replace(/.*\((\".+\")\).*/g, '$1') + ']');
    });

    b.forEach((value) => {
        let table = value.tableName.replace(/\:\:/, '\\:\\:');
        value.fields.forEach((field) => {
            var re = new RegExp('(CREATE TABLE \\"' + table + '\\"\\(\\n[^//]*  )(\\"'+ field +'\\")',"g");
            // (\\n[^//]*  ) - с новой строки. кроме комментариев, два пробела в начале строки
            file = file.replace(re, '$1key $2')
        });
    });

    return file;
}

deleteFolderRecursive(outputFolder);
traverseDir(inputFolder)
  .then(() => zipping())
  .catch(err => console.trace(err));