/*
Запуск: node sqlhana input output, где "input" - папка со скриптами mssql, "output" - папка для hana скриптов
По умолчанию применяются значения: "sap-hana-ddl" и "src"
*/

// добавить создание архива src в конце

const path = require('path');
const fs = require('fs');

const inputFolder = process.argv[2] || 'sap-hana-ddl';
const outputFolder = process.argv[3] || 'src';

const directoryPath = path.join(__dirname, inputFolder); // источник

function traverseDir(dir) { // рекурсивный перебор файлов
    fs.readdir(dir, function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 

        files.forEach(file => {
            let fullPath = path.join(dir, file);
            if (fs.lstatSync(fullPath).isDirectory()) {
                traverseDir(fullPath);
            } else {
                console.log(fullPath);
                replace(fullPath);
            }  
        });
    });
}

function replace(file) {
    fs.readFile(file, 'utf8', function (err,data) {
        if (err) {
          return console.log(err);
        }
        var parentDir = path.dirname(file).split(path.sep).pop(); // имя папки файла
        var subParentDir = path.dirname(file).split(path.sep)[path.dirname(file).split(path.sep).length - 2]; // имя папки файла
        var result = data
        
            .replace(/\r/g, "") // перевести систему пробелов из CRLF в LF
            .replace(/(\/\*).*(\*\/)/g, '') // комментарий
            .replace(/(CREATE TABLE.*\"\(\n  )(\"[^\;]*\;)(\n\nALTER.+\;)/g, '$1key $2')
                // costraints:
                // CREATE TABLE - любые символы - "(\n  
                // " - любые символы кроме ; - ;\nALTER
     
            .replace(/(\s\s.*[^\,\(\t\s]$)/gm, '$1;') // добавить ; в конце последней строки (нет , ()
            //.replace(/(\s\s.*)\,$/gm, '$1;') // добавить ; в конце каждоый строки
            .replace(/\)\;/g, `}\ntechnical configuration {\n\tcolumn store;\n};`)
            .replace(/CREATE TABLE/g, 'entity')
            .replace(/NOT NULL GENERATED BY DEFAULT AS IDENTITY/g, 'generated by default as identity(start with 1 increment by 1 no minvalue no maxvalue no cache no cycle)')
            .replace(/NOT NULL/g, 'not null')
            .replace(/ NULL/g, ' null')
            .replace(/(N)('.*')/g, '$2') // default N'@UNKNOWN'
            .replace(/DEFAULT/g, 'default')

            .replace(/SMALLINT/g, ': Int16')
            .replace(/NVARCHAR\(/g, ': String(')
            .replace(/VARCHAR\(/g, ': String(')
            .replace(/BIGINT/g, ': Integer')
            .replace(/TINYINT/g, ': Integer')
            .replace(/INT/g, ': Integer')
            .replace(/REAL/g, ': Decimal(24,6)')
            .replace(/FLOAT/g, ': Decimal(24,6)')
            .replace(/NUMERIC/g, ': Decimal')
            .replace(/DECIMAL/g, ': Decimal')
            .replace(/TIMESTAMP/g, ': Timestamp')
            
            .replace(/\"\(/g, '"{')
            .replace(/\/\*w*\*\//g, '')
            .replace(/\,/g, ';')
            .replace(/(\d+)\;(\d+)/g, '$1,$2') // ; между двумя числами;
            .replace(/^/gm, "\t") // добавить табуляцию в начало строки
            .replace(/\n\t\n\t\n/gm, '\n\n')
            .replace(/(\w+\:\:\w+\.)(\w+)/g, '$2'); // название таблицы

            // result = 'namespace sap_hana_ddl.' + ' {\n' + result + '\n\n};';
           result = `namespace sap_hana_ddl.${subParentDir};\n\ncontext ${parentDir} {\n${result}\n\n};`;
        // result = 'namespace sap_hana_ddl.' + subParentDir + ';\n\ncontext ' + parentDir + ' {\n' + result + '\n\n};';
        // добавление кода в начало и конец файла

        if (!fs.existsSync(outputFolder)) { fs.mkdirSync(outputFolder) }

        let newFolder = path.join(__dirname, outputFolder, subParentDir);

        if (!fs.existsSync(newFolder)) { fs.mkdirSync(path.join(newFolder)) }
        let newName = path.join(newFolder, path.dirname(file).split(path.sep).pop() + '.hdbcds');
        console.log(newName);

        fs.writeFile(newName, result, 'utf8', function (err) {
           if (err) return console.log(err);
        });
      });
}

traverseDir(directoryPath);