all:
	rm -rf build
	mkdir -p build/
	node app.js
	llc build/app.ll -o build/app.s
	mkdir -p bin
	clang build/*.s src/*.c -o bin/app