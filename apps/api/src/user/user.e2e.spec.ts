import {
  FastifyAdapter,
  NestFastifyApplication
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { UserModule } from './user.module'
import { PrismaService } from '../prisma/prisma.service'
import { AppModule } from '../app/app.module'
import { User } from '@prisma/client'
import { MAIL_SERVICE } from '../mail/services/interface.service'
import { MockMailService } from '../mail/services/mock.service'
import { UserService } from './service/user.service'
import cleanUp from '../common/cleanup'

describe('User Controller Tests', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let userService: UserService

  let adminUser: User
  let regularUser: User
  let janeDoeId: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, UserModule]
    })
      .overrideProvider(MAIL_SERVICE)
      .useClass(MockMailService)
      .compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    )
    prisma = moduleRef.get(PrismaService)
    userService = moduleRef.get(UserService)

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    await cleanUp(prisma)

    adminUser = await userService.createUser({
      email: 'admin@keyshade.xyz',
      name: 'Admin',
      isActive: true,
      isAdmin: true,
      isOnboardingFinished: false
    })

    regularUser = await userService.createUser({
      email: 'john@keyshade.xyz',
      name: 'John',
      isActive: true,
      isAdmin: false,
      isOnboardingFinished: false
    })

    // @ts-expect-error - We don't need the default workspace for these tests
    delete regularUser.defaultWorkspace
    // @ts-expect-error - We don't need the default workspace for these tests
    delete adminUser.defaultWorkspace
  })

  it('should be defined', () => {
    expect(app).toBeDefined()
    expect(prisma).toBeDefined()
    expect(userService).toBeDefined()
  })

  it(`should be able to get self as admin`, async () => {
    const result = await app.inject({
      method: 'GET',
      url: '/user',
      headers: {
        'x-e2e-user-email': adminUser.email
      }
    })
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual({
      ...adminUser
    })
  })

  it(`should be able to get self as user`, async () => {
    const result = await app.inject({
      method: 'GET',
      url: '/user',
      headers: {
        'x-e2e-user-email': regularUser.email
      }
    })
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual({
      ...regularUser
    })
  })

  it('should have created a default workspace', async () => {
    const createUserResponse = await userService.createUser({
      email: 'jane@keyshade.xyz',
      name: 'Jane',
      isAdmin: false,
      isActive: true,
      isOnboardingFinished: true,
      profilePictureUrl: null
    })

    expect(createUserResponse.defaultWorkspace).toBeDefined()
    expect(createUserResponse.defaultWorkspace.name).toEqual('My Workspace')
    expect(createUserResponse.defaultWorkspace.isDefault).toEqual(true)
    expect(createUserResponse.defaultWorkspace.ownerId).toEqual(
      createUserResponse.id
    )

    const workspace = await prisma.workspace.findFirst({
      where: {
        ownerId: createUserResponse.id,
        isDefault: true
      }
    })

    expect(workspace).toBeDefined()
    expect(workspace.name).toEqual('My Workspace')
    expect(workspace.isDefault).toEqual(true)
    expect(workspace.ownerId).toEqual(createUserResponse.id)
  })

  test('regular user should not be able to access other routes if onboarding is not finished', async () => {
    const result = await app.inject({
      method: 'DELETE',
      url: '/user',
      headers: {
        'x-e2e-user-email': regularUser.email
      }
    })
    expect(result.statusCode).toEqual(401)
  })

  test('admin user should not be able to access other routes if onboarding is not finished', async () => {
    const result = await app.inject({
      method: 'DELETE',
      url: '/user',
      headers: {
        'x-e2e-user-email': adminUser.email
      }
    })
    expect(result.statusCode).toEqual(401)
  })

  test('user should be able to update themselves', async () => {
    const result = await app.inject({
      method: 'PUT',
      url: '/user',
      headers: {
        'x-e2e-user-email': regularUser.email
      },
      payload: {
        name: 'John Doe',
        isOnboardingFinished: true
      }
    })
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual({
      ...regularUser,
      name: 'John Doe',
      isOnboardingFinished: true
    })

    regularUser = JSON.parse(result.body)
  })

  test('admin should be able to update themselves', async () => {
    const result = await app.inject({
      method: 'PUT',
      url: '/user',
      headers: {
        'x-e2e-user-email': adminUser.email
      },
      payload: {
        name: 'Admin Doe',
        isOnboardingFinished: true
      }
    })
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual({
      ...adminUser,
      name: 'Admin Doe',
      isOnboardingFinished: true
    })

    adminUser = JSON.parse(result.body)
  })

  it('should fail if duplicate user is created', async () => {
    const result = await app.inject({
      method: 'POST',
      url: '/user',
      headers: {
        'x-e2e-user-email': adminUser.email
      },
      payload: {
        email: adminUser.email,
        name: 'Admin',
        isAdmin: false,
        isActive: true,
        isOnboardingFinished: true
      }
    })
    expect(result.statusCode).toEqual(409)
  })

  test('admin should be able to get any user by id', async () => {
    const result = await app.inject({
      method: 'GET',
      url: `/user/${regularUser.id}`,
      headers: {
        'x-e2e-user-email': adminUser.email
      }
    })
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual({
      ...regularUser
    })
  })

  test('admin should be able to fetch all users', async () => {
    const result = await app.inject({
      method: 'GET',
      url: `/user/all`,
      headers: {
        'x-e2e-user-email': adminUser.email
      }
    })
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body).length).toEqual(3)
  })

  test('admin should be able to update any user', async () => {
    const result = await app.inject({
      method: 'PUT',
      url: `/user/${regularUser.id}`,
      headers: {
        'x-e2e-user-email': adminUser.email
      },
      payload: {
        name: 'John Doe',
        isOnboardingFinished: true
      }
    })
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual({
      ...regularUser,
      name: 'John Doe',
      isOnboardingFinished: true
    })

    regularUser = JSON.parse(result.body)
  })

  test('admin should be able to create new users', async () => {
    const payload = {
      email: 'janedoe@keyshade.xyz',
      name: 'Jane Doe',
      isAdmin: false,
      isActive: true,
      isOnboardingFinished: true
    }

    const result = await app.inject({
      method: 'POST',
      url: `/user`,
      headers: {
        'x-e2e-user-email': adminUser.email
      },
      payload
    })
    expect(result.statusCode).toEqual(201)
    expect(JSON.parse(result.body)).toEqual({
      ...payload,
      id: expect.any(String),
      profilePictureUrl: null,
      defaultWorkspace: expect.any(Object)
    })

    janeDoeId = JSON.parse(result.body).id
  })

  test('admin should be able to delete any user', async () => {
    const result = await app.inject({
      method: 'DELETE',
      url: `/user/${janeDoeId}`,
      headers: {
        'x-e2e-user-email': adminUser.email
      }
    })
    expect(result.statusCode).toEqual(204)
  })

  test('user should be able to delete their own account', async () => {
    const result = await app.inject({
      method: 'DELETE',
      url: `/user`,
      headers: {
        'x-e2e-user-email': regularUser.email
      }
    })

    expect(result.statusCode).toEqual(204)
  })

  it('should have deleted the default workspace', async () => {
    // Fetching the user who's account has the default workspace
    const user = await prisma.user.findFirst({
      where: {
        email: 'jane@keyshade.xyz'
      }
    })

    // Delete the user
    await userService.deleteUser(user.id)
  })

  afterAll(async () => {
    await cleanUp(prisma)
    await prisma.$disconnect()
    await app.close()
  })
})
