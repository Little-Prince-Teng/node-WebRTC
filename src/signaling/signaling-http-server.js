import http from 'http'
import { Server } from 'socket.io'
import express from 'express'

const port = 3000
const app = express()
const httpServer = http.createServer(app)

//设置跨域访问
app.all('*', (req, res, next) => {
	//设置允许跨域的域名，*代表允许任意域名跨域
	res.header('Access-Control-Allow-Origin', '*')
	//允许的header类型
	res.header('Access-Control-Allow-Headers', 'content-type')
	//跨域允许的请求方式
	res.header('Access-Control-Allow-Methods', 'DELETE,PUT,POST,GET,OPTIONS')
	//让options尝试请求快速结束
	if (req.method.toLowerCase() == 'options') res.send(200)
	else next()
})

// 随便写一个接口测试一下
app.get('/', (req, res) => {
	res.type('application/json')
	res.end(JSON.stringify({ status: 0, message: '测试成功~🌸' }, 'utf8'))
})

// 创建信令服务
const io = new Server(httpServer, {
	cors: {
		origin: '*', // 允许跨域
		methods: ['GET', 'POST'], // 允许的请求方式
		allowedHeaders: '*', // 允许的请求头
		credentials: true // 允许携带cookie
	},
	allowEIO3: true, // 是否启用与Socket.IO v2客户端的兼容性
	transport: ['websocket'], // 仅允许websocket, ['polling', 'websocket']
})
// 在指定端口启动服务器
httpServer.listen(port, () => {
	console.log('\n Http server up and running at => http://%s:%s', 'localhost', httpServer.address().port)
})

// 房间信息
const ROOM_LIST = []
// 每个房间最多容纳的人数
const MAX_USER_COUNT = 2

// 监听用户连接
io.on('connection', (socket) => {
	// 用户加入房间
	socket.on('join', (data) => {
		handleUserJoin(socket, data)
	})
	// 用户离开房间
	socket.on('leave', (data) => {
		handleUserDisconnect(socket)
	})
	// 监听连接断开
	socket.on('disconnection', () => {
		console.log('disconnection')
	})
	// 用户发出offer
	socket.on('offer', (data) => {
		socket.to(data.roomId).emit('offer', data)
	})
	// 用户发出answer
	socket.on('answer', (data) => {
		socket.to(data.roomId).emit('answer', data)
	})
	socket.on('candidate', (data) => {
		console.log('candidate', data)
	})
	socket.on('message', (data) => {
		console.log('message', data)
	})
})

// 用户加入房间
function handleUserJoin(socket, data) {
	const filterRoom = ROOM_LIST.filter(item => item.roomId === data.roomId)[0]
	let room = { roomId: data.roomId, userList: [] }
	// 判断房间是否存在
	if (filterRoom) {
		room = filterRoom
	} else {
		ROOM_LIST.push(room)
	}
	// 每个房间人数不超过预设人数
	if (room.userList.length >= MAX_USER_COUNT) {
		socket.emit('error', '房间人数已满，请稍后再试')
		return
	}

	// 当房间人数为0且管理员还没有设置，则设置管理员
	if (room.userList.length === 0) {
		room.admin = data.userId
	}

	// 判断用户是否已经在房间里
	const filterUser = room.userList.some((item) => item.userId === data.userId)
	if (filterUser) {
		socket.emit('error', '用户已经在房间里了')
		return
	}

	// 将用户信息保存到 socket 对象中
	socket.userId = data.userId
	socket.roomId = data.roomId

	// 将用户保存到room中
	room.userList.push(data)
	// 将用户加入到房间
	socket.join(data.roomId)
	// 通知房间内的所有人
	io.to(data.roomId).emit('welcome', data)
	// 通知房间内的其他用户创建offer
	socket.to(data.roomId).emit('createOffer', data)
}

// 用户断开连接或离开房间，清楚房间内的用户信息，关闭房间，通知房间内的其他用户
function handleUserDisconnect(socket) {
	const roomId = socket.roomId
	const userId = socket.userId
	const room = ROOM_LIST.filter((item) => item.roomId === roomId)[0]
	if (room) {
		const userList = room.userList
		const filterUser = userList.filter((item) => item.userId === userId)[0]
		if (filterUser) {
			// 通知房间内的其他用户
			socket.to(roomId).emit('leave', filterUser)
			// 清楚房间内的用户信息
			room.userList = userList.filter((item) => item.userId !== userId)
			// 关闭房间
			if (room.userList.length === 0) {
				ROOM_LIST.splice(ROOM_LIST.indexOf(room), 1)
			}
		}
	}
}