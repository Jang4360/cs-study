# 재현: 서버는 커밋 후 느린 동기 호출(4.5s) → 클라이언트 3s read timeout
import socket, sqlite3, threading, time, http.client, os
DB='repro.db'
if os.path.exists(DB): os.remove(DB)
c=sqlite3.connect(DB); c.execute('create table point_grant(partner_tx_id text primary key, status text)'); c.commit(); c.close()
log=lambda *a: print(f"{time.monotonic()-T0:6.3f}s", *a, flush=True)
srv=socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR,1); srv.bind(('127.0.0.1',0)); srv.listen(1); port=srv.getsockname()[1]
def server():
    conn,_=srv.accept(); conn.recv(4096); log('SERVER received')
    db=sqlite3.connect(DB); db.execute("insert into point_grant values('PTX-0421','GRANTED')"); db.commit(); log('SERVER committed')
    time.sleep(4.5); log('SERVER slow notify done')
    body=b'{"result":"OK"}'*2000
    try:
        conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: %d\r\n\r\n'%len(body)); time.sleep(0.05); conn.sendall(body); log('SERVER response written')
    except OSError as e: log('SERVER write failed:', e)
T0=time.monotonic(); threading.Thread(target=server).start()
cl=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
try: cl.request('POST','/grant',body='x'); cl.getresponse(); log('CLIENT got response')
except Exception as e: log('CLIENT error:', type(e).__name__, e)
cl.close(); log('CLIENT closed connection')
time.sleep(5)
log('DB rows:', sqlite3.connect(DB).execute('select * from point_grant').fetchall())
