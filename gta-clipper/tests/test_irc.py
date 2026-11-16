import socket
import threading

from clipper.chat.irc import TwitchChat, parse_line

PRIVMSG = (
    "@badge-info=subscriber/14;badges=subscriber/12,premium/1;color=#1E90FF;"
    "display-name=CoolViewer;emotes=;first-msg=0;flags=;id=6d9b8a0e-1f6c-4d5c-9a2e-0f3d2b1c4a5e;"
    "mod=0;room-id=71092938;subscriber=1;tmi-sent-ts=1731679200123;turbo=0;"
    "user-id=123456789;user-type= :coolviewer!coolviewer@coolviewer.tmi.twitch.tv "
    "PRIVMSG #xQc :LMAO no way he did that: twice\r\n"
)

USERNOTICE = (
    "@badge-info=subscriber/1;badges=subscriber/0;color=;display-name=GiftGuy;emotes=;"
    "login=giftguy;msg-id=subgift;msg-param-recipient-display-name=Lucky;"
    "room-id=71092938;system-msg=GiftGuy\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\sLucky!;"
    "tmi-sent-ts=1731679201000;user-id=987 :tmi.twitch.tv USERNOTICE #xqc"
)

RESUB = (
    "@display-name=;login=quietone;msg-id=resub;"
    "system-msg=quietone\\ssubscribed\\sfor\\s3\\smonths\\:\\swow\\\\; "
    ":tmi.twitch.tv USERNOTICE #xqc :still here"
)


def test_privmsg_with_tags():
    channel, msg = parse_line(PRIVMSG, 12.5)
    assert channel == "xqc"
    assert msg.t == 12.5
    assert msg.user == "CoolViewer"
    assert msg.text == "LMAO no way he did that: twice"
    assert msg.kind == "msg"


def test_privmsg_without_tags_uses_prefix():
    channel, msg = parse_line(":someone!someone@someone.tmi.twitch.tv PRIVMSG #chan :hej", 1.0)
    assert (channel, msg.user, msg.text, msg.kind) == ("chan", "someone", "hej", "msg")


def test_privmsg_empty_display_name_falls_back_to_prefix():
    line = "@display-name=;color= :nick1!nick1@nick1.tmi.twitch.tv PRIVMSG #chan :XD"
    _, msg = parse_line(line, 0.0)
    assert msg.user == "nick1"


def test_privmsg_action():
    line = ":a!a@a.tmi.twitch.tv PRIVMSG #chan :\x01ACTION dances\x01"
    _, msg = parse_line(line, 0.0)
    assert msg.text == "dances"


def test_usernotice_is_system():
    channel, msg = parse_line(USERNOTICE, 99.0)
    assert channel == "xqc"
    assert msg.kind == "system"
    assert msg.user == "GiftGuy"
    assert msg.text == "GiftGuy gifted a Tier 1 sub to Lucky!"
    assert msg.t == 99.0


def test_usernotice_escapes_and_user_text():
    _, msg = parse_line(RESUB, 0.0)
    assert msg.kind == "system"
    assert msg.user == "quietone"
    assert msg.text == "quietone subscribed for 3 months; wow\\ still here"


def test_other_lines_are_ignored():
    for line in (
        "PING :tmi.twitch.tv",
        ":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!",
        ":tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands",
        ":justinfan123!justinfan123@justinfan123.tmi.twitch.tv JOIN #xqc",
        "@emote-only=0;room-id=1 :tmi.twitch.tv ROOMSTATE #xqc",
        "@ban-duration=600;room-id=1 :tmi.twitch.tv CLEARCHAT #xqc :baduser",
        "@display-name=X :x!x@x.tmi.twitch.tv WHISPER justinfan123 :psst",
        "",
        "@only=tags",
    ):
        assert parse_line(line, 0.0) is None, line


def test_client_handshake_ping_and_reconnect():
    """Lokalny serwer bez TLS: handshake, PONG, wiadomosc, ponowne polaczenie."""
    server = socket.create_server(("127.0.0.1", 0))
    server.settimeout(10)
    port = server.getsockname()[1]
    seen: dict[str, list[str]] = {"first": [], "second": []}
    got: list[tuple[str, str, float]] = []
    done = threading.Event()

    def read_lines(conn, count):
        buf = b""
        while buf.count(b"\r\n") < count:
            chunk = conn.recv(4096)
            if not chunk:
                break
            buf += chunk
        return buf.decode().split("\r\n")[:-1]

    def serve():
        conn, _ = server.accept()
        with conn:
            conn.settimeout(10)
            seen["first"] = read_lines(conn, 3)
            conn.sendall(b"PING :tmi.twitch.tv\r\n")
            seen["first"] += read_lines(conn, 1)
        # po zerwaniu klient ma wrocic sam
        conn, _ = server.accept()
        with conn:
            conn.settimeout(10)
            seen["second"] = read_lines(conn, 3)
            # linia pocieta na dwa pakiety
            conn.sendall(b"@display-name=Bob :bob!bob@bob.tmi.twitch.tv PRIV")
            conn.sendall(b"MSG #chan :KEKW\r\n")
            done.wait(10)

    def on_message(channel, msg):
        got.append((channel, msg.text, msg.t))
        done.set()

    chat = TwitchChat(["#Chan"], on_message, clock=lambda: 42.0,
                      host="127.0.0.1", port=port, use_tls=False)
    srv = threading.Thread(target=serve, daemon=True)
    cli = threading.Thread(target=chat.run, daemon=True)
    srv.start()
    cli.start()
    try:
        assert done.wait(15), "klient nie dostal wiadomosci po ponownym polaczeniu"
    finally:
        chat.stop()
        cli.join(5)
        srv.join(5)
        server.close()

    assert not cli.is_alive()
    assert seen["first"][0] == "CAP REQ :twitch.tv/tags twitch.tv/commands"
    assert seen["first"][1].startswith("NICK justinfan")
    assert seen["first"][2] == "JOIN #chan"
    assert seen["first"][3] == "PONG :tmi.twitch.tv"
    assert seen["second"][2] == "JOIN #chan"
    assert got == [("chan", "KEKW", 42.0)]
