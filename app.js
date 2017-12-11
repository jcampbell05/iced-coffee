// Based on BashJS and Castl.js

const esprima = require('esprima');
const llvm = require("llvm-node");
const fs = require('fs');

const program = fs.readFileSync('example.js', 'utf8')
const ast = esprima.parse(program);
const variableContext = {};

function compileExpression(expression, meta) {
    switch(expression.type) {
        case "ArrayExpression":
            return compileArrayExpression(expression, meta);
        case "CallExpression":
            return compileCallExpression(expression, meta);
        case "Identifier":
            return compileIdentifier(expression, meta);
        case "Literal":
            return compileLiteral(expression, meta);
        default:
            // @string
            throw new Error("Unknown Expression type: " + expression.type);
    }
}

function compileCallExpression(expression, meta) {

    var compiledArguments = compileCallArguments(expression.arguments, meta);

    // If callee is method of an object
    if (expression.callee.type === "MemberExpression") {
        throw new Error("Functions For Memeber Objects Not Supported Yet")
    } else {

        const funcReturnType = llvm.Type.getVoidTy(meta.context)
        const funcType = llvm.FunctionType.get(funcReturnType, [
            llvm.Type.getInt8PtrTy(meta.context)
        ], true)
        const func = meta.module.getOrInsertFunction(expression.callee.name, funcType)

        meta.builder.createCall(func, compiledArguments)
    }
}

function compileCallArguments(args, meta) {
    var compiledArguments = [];
    var i;

    // @number
    for (i = 0; i < args.length; ++i) {
        compiledArguments.push(compileExpression(args[i], meta));
    }

    return compiledArguments
}

function compileIdentifier(identifier, meta) {
    var variable = variableContext[identifier.name] 

    if (!variable && meta.value) {

        variable = new llvm.GlobalVariable(
            meta.module,
            llvm.Type.getInt8PtrTy(meta.context),
            false,
            llvm.LinkageTypes.InternalLinkage,
            meta.value
        );
        variableContext[identifier.name] = variable

    } else if (!variable) {

        throw identifier.name + ' not declared'
    }

    return variable.initializer
}

function compileArrayExpression(expression, meta) {
    var compiledArrayExpression = ["("];
    var compiledElements = [];
    var i, length = expression.elements.length;

    // @number
    for (i = 0; i < length; ++i) {
        if (expression.elements[i] !== null) {
            compiledElements.push(compileExpression(expression.elements[i]));
        } else {
            compiledElements.push("nil");
        }
    }

    compiledArrayExpression.push(compiledElements.join(" "));
    compiledArrayExpression.push(")");

    return compiledArrayExpression.join("");
}

function compileLiteral(literal, meta) {
    var ret = literal.raw;

    switch (typeof (literal.value)) {
        case "string":
            ret = meta.builder.createGlobalStringPtr(literal.value)
    }

    return ret;
}

function compileListOfStatements(context, statementList) {

    const llvm_module = new llvm.Module("app", context);

    const mainFuncReturnType = llvm.Type.getInt32Ty(context)
    const mainFuncType = llvm.FunctionType.get(
        mainFuncReturnType,
        [
            llvm.Type.getInt8PtrTy(context)
        ],
        false
    )
    const mainFunc = llvm.Function.create(
        mainFuncType,
        llvm.LinkageTypes.ExternalLinkage,
        "main",
        llvm_module
    )

    const entry = llvm.BasicBlock.create(context, "entry", mainFunc)
    const builder = new llvm.IRBuilder(entry)

    // @number
    for (var i = 0; i < statementList.length; ++i) {
       compileStatement(statementList[i], {
           builder: builder,
           context: context,
           module: llvm_module
       });
    }

    const exitValue = llvm.ConstantInt.get(context, 0)
    builder.createRet(exitValue);

    return llvm_module
}

function compileStatement(statement, meta) {
    switch (statement.type) { 
        case "BlockStatement":
        return compileListOfStatements(statement.body);
        break;
        case "FunctionDeclaration":
        return compileFunctionDeclaration(statement);
        break;
        case "ExpressionStatement":
        return compileExpressionStatement(statement.expression, meta);
        break;
        case "VariableDeclaration":
        return compileVariableDeclaration(statement, meta);
        break;
        case "ForInStatement":
        return compileIterationStatement(statement);
        break;
        case "ReturnStatement":
        return compileReturnStatement(statement);
        break;
        default:
        // @string
        throw new Error("Unknown Statement type: " + statement.type);
    }
}

function compileReturnStatement(statement) {
    var compiledStatements = [];
    return "RETURN=" + compileExpression(statement.argument)
}

function compileExpressionStatement(expression, meta) {
    switch (expression.type) {
        case "CallExpression":
            // @string
            return compileExpression(expression, meta);
        default:
            // @string
            throw new Error("Unknown expression type: " + expression.type);
    }
}

function compileFunctionDeclaration(declaration) {
    var compiledFunctionDeclaration = [];
    var compiledId = compileIdentifier(declaration.id, {
        ignoreSub: true
    });

    compiledFunctionDeclaration.push(compiledId + " () {");
    compiledFunctionDeclaration.push(compileFunction(declaration));
    compiledFunctionDeclaration.push("}");

    return compiledFunctionDeclaration.join('\n')
}

function compileFunction(fun) {
    
    var compiledFunction = [];
    var compiledBody = "";

    // Compile body of the function
    if (fun.body.type === "BlockStatement") {
        compiledBody = compileStatement(fun.body);
    } else if (fun.body.type === "Expression") {
        compiledBody = compileExpression(fun.body);
    }

    // Params
    // TODO: fun.defaults are ignored for now
    if (fun.defaults && fun.defaults.length > 0) {
        console.log('Warning: default parameters of functions are ignored');
    }

    var i;
    var params = fun.params;
    var compiledParams = [];
    // @number
    for (i = 0; i < params.length; ++i) {
        const pattern = compilePattern(params[i], {
            ignoreSub: true
        })
        const argIndex = i + 1

        compiledParams.push(pattern + '=$' + argIndex);
    }

    // TODO: arguments function isn't implemented for now
    // TODO: If a global and a funciton share same name then there is a conflict
    compiledFunction.push(compiledParams.join("\n"));

    // Append body and close function
    compiledFunction.push(compiledBody);

    return compiledFunction.join('\n');
}

function compileVariableDeclaration(variableDeclaration, meta) {
    
    var declarations = variableDeclaration.declarations;
    var i, declarator;

    for (i = 0; i < declarations.length; ++i) {

        declarator = declarations[i];

        if (declarator.init !== null) {
            var value = compileExpression(declarator.init, meta);
            meta.value = value

            compileIdentifier(declarator.id, meta);
        }
    }
}

function compileIterationStatement(statement, compiledLabel) {
    var compiledIterationStatement = "";
    // continueNoLabelTracker.push(false);
    // protectedCallManager.openIterationStatement();

    switch (statement.type) {
    // case "ForStatement":
    //     compiledIterationStatement = compileForStatement(statement, compiledLabel);
    //     break;
    // case "WhileStatement":
    //     compiledIterationStatement = compileWhileStatement(statement, compiledLabel);
    //     break;
    // case "DoWhileStatement":
    //     compiledIterationStatement = compileDoWhileStatement(statement, compiledLabel);
    //     break;
    case "ForInStatement":
        compiledIterationStatement = compileForInStatement(statement, compiledLabel);
        break;
    default:
        // @string
        throw new Error("Not an IterationStatement " + statement.type);
    }
    // protectedCallManager.closeIterationStatement();
    // continueNoLabelTracker.pop();

    return compiledIterationStatement;
}

function compileForInStatement(statement, compiledLabel) {
    var compiledForInStatement = [];
    var compiledLeft;

    if (statement.left.type === "VariableDeclaration") {
        compiledLeft = compilePattern(statement.left.declarations[0].id, {
            ignoreSub: true
        });
    } else {
        compiledLeft = compileExpression(statement.left, {
            ignoreSub: true
        });
    }

    var compiledRight = compileExpression(statement.right, {
        ignoreSub: true
    })

    compiledForInStatement.push("for " + compiledLeft + " in " + compiledRight);
    compiledForInStatement.push("do")
    compiledForInStatement.push(compileStatement(statement.body));
    compiledForInStatement.push("done");

    return compiledForInStatement.join("\n");
}

function compilePattern(pattern, meta) {
    switch (pattern.type) {
    case "Identifier":
        return compileIdentifier(pattern, meta);
    case "RestElement":
        throw new Error("Rest parameters (ES6) not supported yet.");
    default:
        // @string
        throw new Error("Unknwown Pattern type: " + pattern.type);
    }
}

const context = new llvm.LLVMContext();
const llvm_module = compileListOfStatements(context, ast.body)
const ll = llvm_module.print(); // prints IR

llvm.verifyModule(llvm_module)
llvm.writeBitcodeToFile(llvm_module, 'build/app.ll'); // Writes file to disk
