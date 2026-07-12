#!/usr/bin/env node
const fs=require('fs');
const code=fs.readFileSync(require('path').join(__dirname,'../apps-script/Code.gs'),'utf8');
const checks=[
  ['schema v4',/SCHEMA_VERSION\s*=\s*4/],
  ['flat authoritative mode',/flat-normalized-authoritative/],
  ['flat People columns',/first_name.*middle_name.*last_name.*bio/],
  ['flat branch columns',/BranchesFlat.*branch_type.*long_history/],
  ['normalized parent write',/saveparentrelationship.*ParentRelationships/is],
  ['canonical partner write',/canonicalPartnerId_/],
  ['union partners sheet',/UnionPartners/],
  ['household members sheet',/HouseholdMembers/],
  ['repeating link sheets',/PersonNicknames.*StoryPeople.*EventPeople.*MediaPeople.*RecordSources/is],
  ['flat migration preview',/previewFlatSheetMigration/],
  ['flat migration run',/runFlatSheetMigration/],
  ['flat migration verify',/verifyFlatSheetMigration/],
  ['flat migration rollback',/rollbackFlatSheetMigration/],
  ['workbook validation',/validateWorkbook_/],
  ['instructions sheet',/Instructions/],
  ['data dictionary',/Data Dictionary/],
  ['dropdown validation',/requireValueInList/],
  ['checkbox validation',/insertCheckboxes/],
  ['API assembly from flat cells',/flatObjects_\('persons'\).*assembleLinks_/s],
  ['person save strips relationships',/delete copy\.relationships/],
  ['diagnostics readiness',/readiness.*not-ready/]
];
let failures=0;for(const [name,re] of checks){if(re.test(code))console.log('PASS',name);else{console.error('FAIL',name);failures++;}}
console.log(`\n${checks.length-failures}/${checks.length} storage architecture assertions passed.`);process.exit(failures?1:0);
