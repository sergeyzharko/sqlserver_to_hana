# Microsoft SQL DDL to HANA 2.0 CDS

Запуск:
1. npm i (для установки архиватора).
2. node sqlhana inputFolder outputFolder zip-file, где

    "inputFolder" - папка со скриптами mssql. По умолчанию "sap-hana-ddl" в папке с программой;

    "outputFolder" - папка для HANA 2.0 CDS скриптов. По умолчанию "src" в папке с программой;
    
    "zip-file" - путь к готовый ZIP архиву для импорта в SAP HANA 2.0.