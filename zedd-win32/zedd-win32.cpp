#include <napi.h>
#include <iostream>

#define WIN32_LEAN_AND_MEAN      // Exclude rarely-used stuff from Windows headers
#include <windows.h>



Napi::Number GetMillisSinceLastUserInput(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();


	LASTINPUTINFO lii;
	lii.cbSize = sizeof(LASTINPUTINFO);
	BOOL result = GetLastInputInfo(&lii);

	DWORDLONG lastUserInputTick = lii.dwTime;
	DWORDLONG tickCount = GetTickCount();
	if (tickCount < lastUserInputTick) {
		// this means that tickCount overflowed, but lastUserInputTick didn't.
		tickCount += MAXDWORD;
	}

	std::string x = std::to_string(lii.dwTime);

	return Napi::Number::New(env, tickCount - lastUserInputTick);
}

struct SpeichereFensterParams {
	const Napi::Env env;
	std::vector<Napi::Object>& objects;
	HWND foregroundWindow;

	SpeichereFensterParams(
		const Napi::Env env,
		std::vector<Napi::Object>& objects,
		const HWND foregroundWindow) 
			: env(env)
			, objects(objects)
			, foregroundWindow(foregroundWindow) {}
};

std::string ProcessIdToName(DWORD processId) {
	std::string ret;
	HANDLE handle = OpenProcess(
		PROCESS_QUERY_LIMITED_INFORMATION,
		FALSE,
		processId /* This is the PID, you can find one from windows task manager */
	);
	if (handle)
	{
		DWORD buffSize = 1024;
		CHAR buffer[1024];
		if (QueryFullProcessImageNameA(handle, 0, buffer, &buffSize))
		{
			ret = buffer;
		}
		else
		{
			printf("Error GetModuleBaseNameA : %lu", GetLastError());
		}
		CloseHandle(handle);
	}
	else
	{
		printf("Error OpenProcess : %lu", GetLastError());
	}
	return ret;
}

Napi::String GetWindowProcessImageName(const Napi::Env &env, HWND hWnd) {
	DWORD processId;
	DWORD threadId = GetWindowThreadProcessId(hWnd, &processId);

	std::string processName = ProcessIdToName(processId);
	return Napi::String::New(env, processName);
}

Napi::String GetWindowPlacementAsNapiString(const Napi::Env &env, HWND hWnd) {
	WINDOWPLACEMENT windowPlacement;
	windowPlacement.length = sizeof(WINDOWPLACEMENT);

	GetWindowPlacement(hWnd, &windowPlacement);

	if (windowPlacement.showCmd == SW_SHOWMAXIMIZED) {
		return Napi::String::New(env, "maximized");
	}
	if (windowPlacement.showCmd == SW_SHOWNORMAL) {
		return Napi::String::New(env, "normal");
	}
	if (windowPlacement.showCmd == SW_SHOWMINIMIZED) {
		return Napi::String::New(env, "minimized");
	}
	return Napi::String::New(env, "ERROR!");
}

BOOL CALLBACK GetWindowInfosEnumCallback(HWND hWnd, LPARAM lParam) {
	SpeichereFensterParams& params =
		*reinterpret_cast<SpeichereFensterParams*>(lParam);

	const DWORD TITLE_SIZE = 1024;
	WCHAR windowTitle[TITLE_SIZE];

	GetWindowTextW(hWnd, windowTitle, TITLE_SIZE);
	int length = ::GetWindowTextLength(hWnd);
	if (!IsWindowVisible(hWnd) || length == 0) {
		return TRUE;
	}

	Napi::Object obj = Napi::Object::New(params.env);
	obj["name"] = Napi::String::New(params.env, (char16_t *)windowTitle);
	obj["foreground"] = Napi::Boolean::New(params.env, params.foregroundWindow == hWnd);
	obj["placement"] = GetWindowPlacementAsNapiString(params.env, hWnd);
	obj["processName"] = GetWindowProcessImageName(params.env, hWnd);

	// Retrieve the pointer passed into this callback, and re-'type' it.
	// The only way for a C API to pass arbitrary data is by means of a void*.
	params.objects.push_back(obj);

	return TRUE;
}

Napi::Array vectorToNapiArray(Napi::Env env, std::vector<Napi::Object>& vec) {
	Napi::Array array = Napi::Array::New(env, vec.size());

	for (int i = 0; i < vec.size(); i++) {
		array.Set((uint32_t)i, vec[i]);
	}
	
	return array;
}

Napi::Array GetWindowInfos(const Napi::CallbackInfo& info) {
	std::vector<Napi::Object> objects;

	SpeichereFensterParams params = SpeichereFensterParams(info.Env(), objects, GetForegroundWindow());

	EnumWindows(GetWindowInfosEnumCallback, reinterpret_cast<LPARAM>(&params));

	return vectorToNapiArray(info.Env(), objects);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
	exports.Set("getMillisSinceLastUserInput",
		Napi::Function::New(env, GetMillisSinceLastUserInput));
	exports.Set("getWindowInfos", Napi::Function::New(env, GetWindowInfos));
	return exports;
}

NODE_API_MODULE(hello, Init)