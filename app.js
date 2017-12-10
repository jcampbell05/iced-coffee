const esprima = require('esprima');
const llvm = require("llvm-node");

const program = 'const answer = 42';
const ast = esprima.parse(program);

const context = new llvm.LLVMContext();
const lmodule = new llvm.Module("app", context);

const tmpType = llvm.Type.getInt32Ty(context)
const funcType = llvm.FunctionType.get(tmpType, [], false)
const mainFunc = llvm.Function.create(funcType, llvm.LinkageTypes.ExternalLinkage, "main", lmodule)

const entry = llvm.BasicBlock.create(context, "entry", mainFunc)
const builder = new llvm.IRBuilder(entry)

const pType = llvm.Type.getInt32Ty(context)
const printFuncType = llvm.FunctionType.get(tmpType, [], true)
const printFunc = lmodule.getOrInsertFunction("print", printFuncType)

const string = llvm.ConstantDataArray.getString(context, "Hello World!")
const value = llvm.ConstantInt.get(context, 0)

const call = builder.createCall(printFunc, [])

builder.createRet(value);

llvm.verifyModule(lmodule)

const ll = lmodule.print(); // prints IR
llvm.writeBitcodeToFile(lmodule, 'build/app.ll'); // Writes file to disk