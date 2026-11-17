#!/usr/bin/env python3
"""仅转发到宿主机本地模型适配器的 TCP 中继（沙箱内使用）。

- 监听容器网络地址，把字节流原样转发到宿主机上的 NeonForge 评估适配器。
- 不做 HTTP 解析、不记录请求/响应正文。
- 目标地址由启动参数固定，避免变成通用出站代理。
"""

import argparse
import socket
import socketserver
import sys
import threading


class RelayHandler(socketserver.BaseRequestHandler):
    target_host: str = ""
    target_port: int = 0

    def handle(self) -> None:
        try:
            upstream = socket.create_connection(
                (self.target_host, self.target_port), timeout=10
            )
        except OSError:
            return
        upstream.settimeout(None)

        def pump(src: socket.socket, dst: socket.socket) -> None:
            try:
                while True:
                    data = src.recv(65536)
                    if not data:
                        break
                    dst.sendall(data)
            except OSError:
                pass
            finally:
                try:
                    dst.shutdown(socket.SHUT_WR)
                except OSError:
                    pass
                try:
                    src.close()
                except OSError:
                    pass

        t = threading.Thread(target=pump, args=(upstream, self.request), daemon=True)
        t.start()
        pump(self.request, upstream)
        t.join(timeout=5)
        try:
            upstream.close()
        except OSError:
            pass


class ThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def parse_endpoint(value: str) -> tuple[str, int]:
    host, sep, port = value.rpartition(":")
    if not sep or not host or not port.isdigit():
        raise argparse.ArgumentTypeError(f"invalid endpoint: {value}")
    return host, int(port)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen", default="0.0.0.0:18080", type=parse_endpoint)
    parser.add_argument("--target", required=True, type=parse_endpoint)
    args = parser.parse_args()

    RelayHandler.target_host, RelayHandler.target_port = args.target
    with ThreadingTCPServer(args.listen, RelayHandler) as server:
        print(
            f"[relay] listening {args.listen[0]}:{args.listen[1]} -> "
            f"{args.target[0]}:{args.target[1]}",
            flush=True,
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
