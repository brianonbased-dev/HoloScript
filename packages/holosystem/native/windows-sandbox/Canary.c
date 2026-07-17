#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

static int read_token_integer(HANDLE token, TOKEN_INFORMATION_CLASS information_class, int fallback)
{
    DWORD required = 0;
    BYTE *buffer;
    int value;
    GetTokenInformation(token, information_class, NULL, 0, &required);
    if (required == 0) return fallback;
    buffer = (BYTE *)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, required);
    if (buffer == NULL) return fallback;
    if (!GetTokenInformation(token, information_class, buffer, required, &required)) {
        HeapFree(GetProcessHeap(), 0, buffer);
        return fallback;
    }
    value = *(int *)buffer;
    HeapFree(GetProcessHeap(), 0, buffer);
    return value;
}

int wmain(int argc, wchar_t **argv)
{
    HANDLE file = INVALID_HANDLE_VALUE;
    HANDLE token = NULL;
    WSADATA socket_data;
    SOCKET socket_handle = INVALID_SOCKET;
    struct sockaddr_in address;
    fd_set writable;
    fd_set exceptional;
    struct timeval wait_time;
    u_long nonblocking = 1;
    int port;
    int filesystem_error = 0;
    int network_error = 0;
    int app_container = 0;
    int capability_count = -1;

    if (argc != 5 || wcscmp(argv[1], L"--protected-sentinel") != 0 ||
        wcscmp(argv[3], L"--loopback-port") != 0) return 64;
    port = _wtoi(argv[4]);
    if (port < 1 || port > 65535) return 64;

    file = CreateFileW(
        argv[2], GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL, NULL
    );
    if (file == INVALID_HANDLE_VALUE) filesystem_error = (int)GetLastError();
    else CloseHandle(file);

    if (WSAStartup(MAKEWORD(2, 2), &socket_data) != 0) {
        network_error = WSAGetLastError();
    } else {
        socket_handle = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (socket_handle == INVALID_SOCKET) {
            network_error = WSAGetLastError();
        } else {
            ioctlsocket(socket_handle, FIONBIO, &nonblocking);
            ZeroMemory(&address, sizeof(address));
            address.sin_family = AF_INET;
            address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
            address.sin_port = htons((u_short)port);
            if (connect(socket_handle, (struct sockaddr *)&address, sizeof(address)) == SOCKET_ERROR) {
                network_error = WSAGetLastError();
                if (network_error == WSAEWOULDBLOCK) {
                    FD_ZERO(&writable);
                    FD_ZERO(&exceptional);
                    FD_SET(socket_handle, &writable);
                    FD_SET(socket_handle, &exceptional);
                    wait_time.tv_sec = 2;
                    wait_time.tv_usec = 0;
                    if (select(0, NULL, &writable, &exceptional, &wait_time) > 0) {
                        int socket_error = 0;
                        int error_length = sizeof(socket_error);
                        if (getsockopt(
                            socket_handle, SOL_SOCKET, SO_ERROR,
                            (char *)&socket_error, &error_length
                        ) == 0) network_error = socket_error;
                        else network_error = WSAGetLastError();
                    } else {
                        network_error = WSAETIMEDOUT;
                    }
                }
            }
            closesocket(socket_handle);
        }
        WSACleanup();
    }

    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
        app_container = read_token_integer(token, TokenIsAppContainer, 0);
        capability_count = read_token_integer(token, TokenCapabilities, -1);
        CloseHandle(token);
    }

    printf(
        "appContainer=%d;capabilityCount=%d;filesystemError=%d;networkError=%d\n",
        app_container != 0 ? 1 : 0,
        capability_count,
        filesystem_error,
        network_error
    );
    return 0;
}
